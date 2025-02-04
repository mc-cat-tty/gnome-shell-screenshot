(function (Gio, GLib) {
  'use strict';

  //  Create screenshot using dbus interface
  const System = imports.system;
  let debug = true;
  const logDebug = (msg) => {
      if (debug) {
          log(msg);
      }
  };

  const logDebugObject = (name, obj) => {
    logDebug(name + ": " + obj + " type: " + typeof(obj));
  }

  // https://gitlab.gnome.org/GNOME/gnome-shell/blob/master/data/org.gnome.Shell.Screenshot.xml
  const ScreenshotServiceIFace = `
<node>
  <interface name="org.freedesktop.portal.Screenshot">
    <method name="Screenshot">
      <arg type="s" name="parent_window" direction="in"/>
      <arg type="a{sv}" name="options" direction="in"/>
      <arg type="o" name="handle" direction="out"/>
    </method>
    <method name="PickColor">
      <arg type="s" name="parent_window" direction="in"/>
      <arg type="a{sv}" name="options" direction="in"/>
      <arg type="o" name="handle" direction="out"/>
    </method>
  </interface>
</node>
`;
  const ScreenshotServiceProxy = Gio.DBusProxy.makeProxyWrapper(ScreenshotServiceIFace);
  const getScreenshotService = () => {
      return new ScreenshotServiceProxy(Gio.DBus.session, 'org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop');
  };
  const makeDesktopScreenshot = (fileName, { includeCursor, flash }) => {
      logDebug('creating desktop screenshot...');
      return getScreenshotService().ScreenshotSync(includeCursor, flash, fileName);
  };
  const makeWindowScreenshot = (fileName, { includeFrame, includeCursor, flash }) => {
      logDebug('creating window screenshot...');
      return getScreenshotService().ScreenshotWindowSync(includeFrame, includeCursor, flash, fileName);
  };
  const makeAreaScreenshot = (fileName, { x, y, w, h }, { flash }) => {
      logDebug('creating area screenshot...');
      let handle = getScreenshotService().ScreenshotSync("wayland: 1", {});
      logDebugObject("handle", handle);
      logDebugObject("handle[0]", handle[0]);
      return handle[0];
  };
  const parseOptions = (params, argv) => [...argv].reduce((acc, arg, i, argv) => {
      const fullArg = Object.keys(params).find((p) => p === arg || p.startsWith(arg + ' '));
      if (!fullArg) {
          throw new Error(`no such parameter ${arg}`);
      }
      const isSwitch = fullArg === arg;
      const name = arg.replace(/^--/, '').replace(/-[a-z]/, ([, c]) => c.toUpperCase());
      let val;
      if (isSwitch) {
          val = true;
      }
      else if (i + 1 in argv) {
          val = argv[i + 1];
          delete argv[i + 1];
      }
      else {
          throw new Error(`no value for parameter ${arg}`);
      }
      acc[name] = val;
      return acc;
  }, {});
  const dumpOptions = (params) => {
      const pad = (str, n) => str +
          Array(Math.max(0, n - str.length))
              .fill(' ')
              .join('');
      print('Usage:');
      for (const p in params) {
          print(`  ${pad(p, 32)} ${params[p]}`);
      }
  };
  const params = {
      '--desktop': 'make desktop screenshot',
      '--window': 'make window screenshot',
      '--area COORDS': 'make area screenshot (x,y,w,h)',
      '--include-cursor': 'include cursor (desktop only)',
      '--include-frame': 'include frame (window only)',
      '--flash': 'flash',
      '--filename FILENAME': 'output file',
      '--spawntest': 'test GLib spawn call',
      '--debug': 'print debug output',
      '--help': 'show this',
  };
  const main = () => {
      const opts = parseOptions(params, ARGV);
      if (opts.help) {
          return dumpOptions(params);
      }
      if (opts.debug) {
          debug = true;
      }
      if (opts.spawntest) {
          const newOpts = ARGV.filter((a) => a.toLowerCase() !== '--spawntest');
          if (parseOptions(params, newOpts).spawntest) {
              throw new Error();
          }
          const newArgv = ['gjs', './src/auxhelper.js', ...newOpts];
          const [success, pid] = GLib.spawn_async(null /* pwd */, newArgv, null /* envp */, GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null /* child_setup */);
          if (!success || pid === null) {
              throw new Error();
          }
          GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (_pid, _exitCode) => {
              imports.mainloop.quit();
          });
          imports.mainloop.run();
          return;
      }
      const { filename: fileName } = opts;
      if (!fileName) {
          throw new Error('required argument --filename');
      }
      if (!fileName.startsWith('/')) {
          throw new Error('filename path must be absolute');
      }
      const { flash = false, includeCursor = false, includeFrame = true } = opts;
      const screenshotOpts = { flash, includeCursor, includeFrame };
      const funcs = [];
      if (opts.desktop) {
          funcs.push(() => makeDesktopScreenshot(fileName, screenshotOpts));
      }
      if (opts.area) {
          const coords = opts.area.split(',').map(Number);
          if (coords.some(isNaN)) {
              throw new Error("invalid --area coords (must be 'x,y,w,h')");
          }
          const [x, y, w, h] = coords;
          funcs.push(() => makeAreaScreenshot(fileName, { x, y, w, h }, screenshotOpts));
      }
      if (opts.window) {
          funcs.push(() => makeWindowScreenshot(fileName, screenshotOpts));
      }
      const func = funcs.pop();
      if (!func || funcs.length > 0) {
          throw new Error('must use --desktop, --area or --window');
      }
      logDebug('calling func...');
      const handle = func();
      if (!handle) {
          throw new Error('Null return value');
      }
      /*
      if (fileName !== fileNameUsed) {
          throw new Error(`path mismatch fileName=${fileName} fileNameUsed=${fileNameUsed}`);
      }
      logDebug(`written ${fileNameUsed}`);
      */
      logDebug("Exiting from main funciton...");
      return handle;
  };
  try {
      main();
  }
  catch (e) {
      logError(e);
      System.exit(1);
  }

}(imports.gi.Gio, imports.gi.GLib));

const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Main = imports.ui.main;
// const Tweener = imports.ui.tweener;
const Gio = imports.gi.Gio;
const Mainloop = imports.mainloop;
// const GLib = imports.gi.GLib;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PREFS_SCHEMA = 'org.gnome.shell.extensions.harddiskled';
const refreshTime = 2.0;

const ledThreshold = 500000;
const ledMinThreshold = 100000;

let settings;
let button, timeout;
// let icon, iconDark;
let cur;
let ioSpeed;
let lastCount, lastSpeed;
let mode;
let layoutManager;
let ioSpeedStaticIcon;
let ioSpeedIcon;
let byteArrayToString;

if (global.TextDecoder) {
    // available in gjs >= 1.70 (GNOME Shell >= 42)
    byteArrayToString = (new TextDecoder().decode);
}
else {
    // gjs-specific
    byteArrayToString = imports.byteArray.toString;
}

function init() {
    cur = 0;
    lastCount = 0;
}

function changeMode() {
    mode++;
    if (mode > 5) {
        mode = 0;
    }
    settings.set_int('mode', mode);
    parseStat(true);
}

function parseStat(forceDot = false) {
    try {
        let input_file = Gio.file_new_for_path('/proc/diskstats');

        let [, contents, etag] = input_file.load_contents(null);
        contents = byteArrayToString(contents);
        let lines = contents.split('\n');

        let count = 0;
        let line;

        for (let i=0;i<lines.length;i++) {
            line = lines[i];
            let fields = line.split(/ +/);
            if (fields.length<=2) break;

            if (parseInt(fields[2])%16 === 0
                    && fields[3].indexOf('md0') != 0
                    && fields[3].indexOf('ram0') != 0
                    && fields[3].indexOf('dm-0') != 0
                    && fields[3].indexOf('zram0') != 0
                    && fields[3].indexOf('loop0') != 0) {
                count = count + parseInt(fields[6]) + parseInt(fields[10]);
                // log(fields[3] + ':' + fields[6] + ' ' + fields[10] + ' ' + count);
            }

        }

        if (lastCount === 0) lastCount = count;

        let speed = (count - lastCount) / refreshTime * 512;

        let dot = " ";
        if (speed > lastSpeed || forceDot || speed > ledThreshold) {
            if (speed > ledMinThreshold) {
                if (mode == 0 || mode == 2 || mode == 4) {
                    dot = "●";
                } else if (mode == 1 || mode == 3) {
                    dot = "⬤";
                }
            }
        }
        if (mode == 2 || mode == 3) {
            ioSpeed.hide();
        } else {
            ioSpeed.show();
        }
        if (mode == 4 || mode == 5) {
            ioSpeedStaticIcon.hide();
        } else {
            ioSpeedStaticIcon.show();
        }
        if (mode == 5) {
            ioSpeedIcon.hide();
        } else {
            ioSpeedIcon.show();
        }

        ioSpeedIcon.set_text(dot);
        ioSpeed.set_text(speedToString(speed));

        lastCount = count;
        lastSpeed = speed;
    } catch (e) {
        ioSpeed.set_text(e.message);
    }

    /*
    let curDiskstats = GLib.file_get_contents('/proc/diskstats');

    if (diskstats == curDiskstats) {
        if (cur !== 0) {
            button.set_child(iconDark);
            cur = 0;
        }
    } else {
        if (cur != 1) {
            button.set_child(icon);
            cur = 1;
        }
        diskstats = curDiskstats;
    }*/

    return true;
}

function speedToString(amount) {
    let digits;
    let speed_map;
    speed_map = ["B/s", "K/s", "M/s", "G/s"];

    if (amount === 0)
        return "0"  + speed_map[0];

    let unit = 0;
    while (amount >= 1000) { // 1M=1024K, 1MB/s=1000MB/s
        amount /= 1000;
        ++unit;
    }

    if (amount >= 100) // 100MB 100KB 200KB
        digits = 0;
    else if (amount >= 10) // 10MB 10.2
        digits = 1;
    else
        digits = 2;
    return String(amount.toFixed(digits)) + speed_map[unit];
}

function enable() {
    settings = ExtensionUtils.getSettings(PREFS_SCHEMA);

    mode = settings.get_int('mode'); // default mode

    button = new St.Button({
        style_class: 'panel-button',
        reactive: true,
        can_focus: true,
        x_expand: true,
        y_expand: false,
        track_hover: true
    });

    layoutManager = new St.BoxLayout({
        vertical: false,
        style_class: 'harddiskled-container'});

    /*
    icon = new St.Icon({
        gicon: Gio.icon_new_for_string(Me.path + "/icons/harddisk.svg")
    });
    iconDark = new St.Icon({
        gicon: Gio.icon_new_for_string(Me.path + "/icons/harddisk-dark.svg")
    });*/

    ioSpeedStaticIcon = new St.Icon({
        style_class: 'system-status-icon',
        y_align: Clutter.ActorAlign.CENTER,
        gicon: Gio.icon_new_for_string('drive-harddisk-symbolic')
    });

    ioSpeed = new St.Label({
        text: '---',
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'harddiskled-label'
    });

    ioSpeedIcon = new St.Label({
        text: '',
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'harddiskled-icon'
    });

    layoutManager.add(ioSpeedStaticIcon);
    layoutManager.add(ioSpeedIcon);
    layoutManager.add(ioSpeed);
    button.connect('button-press-event', changeMode);

    button.set_child(layoutManager);

    Main.panel._rightBox.insert_child_at_index(button, 0);
    timeout = Mainloop.timeout_add_seconds(refreshTime, parseStat);
}

function disable() {
    Mainloop.source_remove(timeout);
    timeout = null;
    Main.panel._rightBox.remove_child(button);
    button.destroy();
    settings = button = layoutManager = ioSpeedStaticIcon = ioSpeed = ioSpeedIcon = null;
}

const St = imports.gi.St;
const Main = imports.ui.main;
// const Tweener = imports.ui.tweener;
const Gio = imports.gi.Gio;
const Mainloop = imports.mainloop;
// const GLib = imports.gi.GLib;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

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

function init() {

    settings = Convenience.getSettings(PREFS_SCHEMA);

    mode = settings.get_int('mode'); // default mode using bit (bps, kbps)

    button = new St.Bin({
        style_class: 'panel-button',
        reactive: true,
        can_focus: true,
        x_fill: true,
        y_fill: false,
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
        gicon: Gio.icon_new_for_string('drive-harddisk-symbolic')
    });

    ioSpeed = new St.Label({
        text: '---',
        style_class: 'harddiskled-label'
    });

    ioSpeedStaticIconx = new St.Label({
        text: '💾',
        style_class: 'harddiskled-static-icon'
    });

    ioSpeedIcon = new St.Label({
        text: '',
        style_class: 'harddiskled-icon'
    });

    layoutManager.add(ioSpeedStaticIcon);
    layoutManager.add(ioSpeedIcon);
    layoutManager.add(ioSpeed);
    button.connect('button-press-event', changeMode);

    button.set_child(layoutManager);

    cur = 0;
    lastCount = 0;
}

function changeMode() {
    mode++;
    if (mode > 4) {
        mode = 0;
    }
    settings.set_int('mode', mode);
    parseStat(true);
}

function parseStat(forceDot = false) {
    try {
        let input_file = Gio.file_new_for_path('/proc/diskstats');
        let fstream = input_file.read(null);
        let dstream = Gio.DataInputStream.new(fstream);

        let count = 0;
        let line;
        while (line = dstream.read_line(null)) {
            line = String(line);
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
        fstream.close(null);

        if (lastCount === 0) lastCount = count;

        let speed = (count - lastCount) / refreshTime * 512;

        let dot = " ";
        if (mode < 4) {
            if (speed > lastSpeed || forceDot || speed > ledThreshold) {
                if (speed > ledMinThreshold) {
                    if (mode == 0 || mode == 2) {
                        dot = "●";
                    } else if (mode == 1 || mode == 3) {
                        dot = "⬤";
                    }
                }
            }
        }
        if (mode == 2 || mode == 3) {
            ioSpeed.hide();
        } else {
            ioSpeed.show();
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
    Main.panel._rightBox.insert_child_at_index(button, 0);
    timeout = Mainloop.timeout_add_seconds(refreshTime, parseStat);
}

function disable() {
    Mainloop.source_remove(timeout);
    Main.panel._rightBox.remove_child(button);
}

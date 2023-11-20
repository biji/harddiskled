import { default as Clutter } from 'gi://Clutter';
import { default as St } from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { default as Gio } from 'gi://Gio';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class HardDiskLEDExtension extends Extension {
    refreshTime = 2.0;

    ledThreshold = 500000;
    ledMinThreshold = 100000;

    settings = null;
    button = null
    timeout = null
    cur = null
    ioSpeed = null
    lastCount = null
    lastSpeed = null
    mode = null;
    layoutManager = null;
    ioSpeedStaticIcon = null;
    ioSpeedIcon = null;
    byteArrayToString = null;

    init() {
        this.cur = 0;
        this.lastCount = 0;

        if (global.TextDecoder) {
            // available in gjs >= 1.70 (GNOME Shell >= 42)
            this.byteArrayToString = (new TextDecoder().decode);
        } else {
            // gjs-specific, imports.byteArray is still available in (GNOME Shell 45 >=) but discouraged!
            this.byteArrayToString = imports.byteArray.toString;
        }
    }

    changeMode() {
        this.mode++;
        if (this.mode > 7) {
            this.mode = 0;
        }
        this.settings.set_int('mode', this.mode);
        this.parseStat(true);
    }

    parseStat(forceDot = false) {
        try {
            let input_file = Gio.file_new_for_path('/proc/diskstats');

            let [, contents, _etag] = input_file.load_contents(null);
            contents = this.byteArrayToString(contents);
            let lines = contents.split('\n');

            let count = 0;
            let line;

            for (let i = 0; i < lines.length; i++) {
                line = lines[i];
                let fields = line.split(/ +/);
                if (fields.length <= 2) break;

                if (parseInt(fields[2]) % 16 === 0
                    && fields[3].indexOf('md0') != 0
                    && fields[3].indexOf('ram0') != 0
                    && fields[3].indexOf('dm-0') != 0
                    && fields[3].indexOf('zram0') != 0
                    && fields[3].indexOf('loop0') != 0) {
                    count = count + parseInt(fields[6]) + parseInt(fields[10]);
                    // log(fields[3] + ':' + fields[6] + ' ' + fields[10] + ' ' + count);
                }

            }

            if (this.lastCount === 0) this.lastCount = count;

            let speed = (count - this.lastCount) / this.refreshTime * 512;

            let dot = " ";
            if (speed > this.lastSpeed || forceDot || speed > this.ledThreshold) {
                if (speed > this.ledMinThreshold) {
                    if (this.mode == 0 || this.mode == 2 || this.mode == 4 || this.mode == 6) {
                        dot = "●";
                    } else if (this.mode == 1 || this.mode == 3 || this.mode == 7) {
                        dot = "⬤";
                    }
                }
            }
            if (this.mode == 2 || this.mode == 3 || this.mode == 6 || this.mode == 7) {
                this.ioSpeed.hide();
            } else {
                this.ioSpeed.show();
            }
            if (this.mode == 4 || this.mode == 5 || this.mode == 6 || this.mode == 7) {
                this.ioSpeedStaticIcon.hide();
            } else {
                this.ioSpeedStaticIcon.show();
            }
            if (this.mode == 5) {
                this.ioSpeedIcon.hide();
            } else {
                this.ioSpeedIcon.show();
            }

            this.ioSpeedIcon.set_text(dot);
            this.ioSpeed.set_text(this.speedToString(speed));

            this.lastCount = count;
            this.lastSpeed = speed;
        } catch (e) {
            this.ioSpeed.set_text(e.message);
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

    speedToString(amount) {
        let digits;
        let speed_map;
        speed_map = ["B/s", "K/s", "M/s", "G/s"];

        if (amount === 0)
            return "0" + speed_map[0];

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

    enable() {
        this.init()
        this.settings = this.getSettings();

        this.mode = this.settings.get_int('mode'); // default mode

        this.button = new St.Button({
            style_class: 'panel-button',
            reactive: true,
            can_focus: true,
            x_expand: true,
            y_expand: false,
            track_hover: true
        });

        this.layoutManager = new St.BoxLayout({
            vertical: false,
            style_class: 'harddiskled-container'
        });

        this.ioSpeedStaticIcon = new St.Icon({
            style_class: 'system-status-icon',
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.icon_new_for_string('drive-harddisk-symbolic')
        });

        this.ioSpeed = new St.Label({
            text: '---',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'harddiskled-label'
        });

        this.ioSpeedIcon = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'harddiskled-icon'
        });

        this.layoutManager.add(this.ioSpeedStaticIcon);
        this.layoutManager.add(this.ioSpeedIcon);
        this.layoutManager.add(this.ioSpeed);
        this.button.connect('button-press-event', this.changeMode.bind(this));

        this.button.set_child(this.layoutManager);

        Main.panel._rightBox.insert_child_at_index(this.button, 0);
        this.timeout = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, 
            this.refreshTime, 
            () => this.parseStat(true)
        );
    }

    disable() {
        GLib.source_remove(this.timeout);
        this.timeout = null;
        Main.panel._rightBox.remove_child(this.button);
        this.button.destroy();
        this.settings = this.button = this.layoutManager = this.ioSpeedStaticIcon = this.ioSpeed = this.ioSpeedIcon = null;
    }
}

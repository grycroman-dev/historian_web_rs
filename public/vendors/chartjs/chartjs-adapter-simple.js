/*!
 * Simple Date Adapter for Chart.js v4.x
 * Provides time scale support without external dependencies (date-fns, luxon, etc.)
 */
(function () {
    'use strict';

    // Duration of each unit in milliseconds
    var DURATIONS = {
        millisecond: 1,
        second: 1000,
        minute: 60000,
        hour: 3600000,
        day: 86400000,
        week: 604800000,
        month: 2592000000,
        quarter: 7776000000,
        year: 31536000000
    };

    function pad(n, len) {
        var s = String(n);
        while (s.length < len) s = '0' + s;
        return s;
    }

    function formatDate(ts, fmt) {
        var d = new Date(ts);
        if (isNaN(d.getTime())) return '';

        var y = d.getFullYear();
        var mo = pad(d.getMonth() + 1, 2);
        var da = pad(d.getDate(), 2);
        var h = pad(d.getHours(), 2);
        var mi = pad(d.getMinutes(), 2);
        var s = pad(d.getSeconds(), 2);
        var ms = pad(d.getMilliseconds(), 3);

        // Match format string to output
        switch (fmt) {
            case 'HH:mm:ss.SSS': return h + ':' + mi + ':' + s + '.' + ms;
            case 'HH:mm:ss': return h + ':' + mi + ':' + s;
            case 'HH:mm': return h + ':' + mi;
            case 'dd.MM. HH:mm': return da + '.' + mo + '. ' + h + ':' + mi;
            case 'dd.MM.yyyy': return da + '.' + mo + '.' + y;
            case 'MM/yyyy': return mo + '/' + y;
            case 'yyyy': return '' + y;
            // Tooltip and fallback
            case 'dd.MM.yyyy HH:mm:ss': return da + '.' + mo + '.' + y + ' ' + h + ':' + mi + ':' + s;
            case 'dd.MM.yyyy HH:mm:ss.SSS': return da + '.' + mo + '.' + y + ' ' + h + ':' + mi + ':' + s + '.' + ms;
            default:
                return da + '.' + mo + '.' + y + ' ' + h + ':' + mi + ':' + s;
        }
    }

    function startOf(ts, unit) {
        var d = new Date(ts);
        switch (unit) {
            case 'millisecond':
                break;
            case 'second':
                d.setMilliseconds(0); break;
            case 'minute':
                d.setSeconds(0, 0); break;
            case 'hour':
                d.setMinutes(0, 0, 0); break;
            case 'day':
                d.setHours(0, 0, 0, 0); break;
            case 'week':
                d.setHours(0, 0, 0, 0);
                d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
                break;
            case 'month':
                d.setHours(0, 0, 0, 0); d.setDate(1); break;
            case 'quarter':
                d.setHours(0, 0, 0, 0); d.setDate(1);
                d.setMonth(Math.floor(d.getMonth() / 3) * 3); break;
            case 'year':
                d.setHours(0, 0, 0, 0); d.setDate(1); d.setMonth(0); break;
        }
        return d.getTime();
    }

    function addUnit(ts, amount, unit) {
        var d = new Date(ts);
        switch (unit) {
            case 'millisecond': return ts + amount;
            case 'second': return ts + amount * 1000;
            case 'minute': return ts + amount * 60000;
            case 'hour': return ts + amount * 3600000;
            case 'day': d.setDate(d.getDate() + amount); return d.getTime();
            case 'week': d.setDate(d.getDate() + amount * 7); return d.getTime();
            case 'month': d.setMonth(d.getMonth() + amount); return d.getTime();
            case 'quarter': d.setMonth(d.getMonth() + amount * 3); return d.getTime();
            case 'year': d.setFullYear(d.getFullYear() + amount); return d.getTime();
            default: return ts + amount;
        }
    }

    // Access the adapter prototype
    var adapters = Chart._adapters;
    if (!adapters || !adapters._date) {
        console.warn('[chartjs-adapter-simple] Chart._adapters._date not found. Is Chart.js loaded?');
        return;
    }

    adapters._date.override({
        _id: 'simple-date-adapter',

        formats: function () {
            return {
                millisecond: 'HH:mm:ss.SSS',
                second: 'HH:mm:ss',
                minute: 'HH:mm',
                hour: 'dd.MM. HH:mm',
                day: 'dd.MM.yyyy',
                week: 'dd.MM.yyyy',
                month: 'MM/yyyy',
                quarter: 'MM/yyyy',
                year: 'yyyy'
            };
        },

        parse: function (value) {
            if (value === null || value === undefined) return null;
            if (typeof value === 'number') return isFinite(value) ? value : null;
            if (value instanceof Date) return isNaN(value.getTime()) ? null : value.getTime();
            // String -> Date
            var d = new Date(value);
            return isNaN(d.getTime()) ? null : d.getTime();
        },

        format: function (ts, fmt) {
            return formatDate(ts, fmt);
        },

        add: function (ts, amount, unit) {
            return addUnit(ts, amount, unit);
        },

        diff: function (a, b, unit) {
            return (a - b) / (DURATIONS[unit] || 1);
        },

        startOf: function (ts, unit) {
            return startOf(ts, unit);
        },

        endOf: function (ts, unit) {
            return addUnit(startOf(ts, unit), 1, unit) - 1;
        }
    });

    console.log('[chartjs-adapter-simple] Date adapter registered successfully.');
})();

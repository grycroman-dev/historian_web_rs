/*!
 * Simple Date Adapter for Chart.js v4.x (UTC)
 * Provides time scale support without external dependencies.
 * All formatting uses UTC to match server-side data.
 */
(function () {
    'use strict';

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

        // Vše v UTC
        var y = d.getUTCFullYear();
        var mo = pad(d.getUTCMonth() + 1, 2);
        var da = pad(d.getUTCDate(), 2);
        var h = pad(d.getUTCHours(), 2);
        var mi = pad(d.getUTCMinutes(), 2);
        var s = pad(d.getUTCSeconds(), 2);
        var ms = pad(d.getUTCMilliseconds(), 3);

        switch (fmt) {
            case 'HH:mm:ss.SSS': return h + ':' + mi + ':' + s + '.' + ms;
            case 'HH:mm:ss': return h + ':' + mi + ':' + s;
            case 'HH:mm': return h + ':' + mi;
            case 'dd.MM. HH:mm': return da + '.' + mo + '. ' + h + ':' + mi;
            case 'dd.MM.yyyy': return da + '.' + mo + '.' + y;
            case 'MM/yyyy': return mo + '/' + y;
            case 'yyyy': return '' + y;
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
                d.setUTCMilliseconds(0); break;
            case 'minute':
                d.setUTCSeconds(0, 0); break;
            case 'hour':
                d.setUTCMinutes(0, 0, 0); break;
            case 'day':
                d.setUTCHours(0, 0, 0, 0); break;
            case 'week':
                d.setUTCHours(0, 0, 0, 0);
                d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
                break;
            case 'month':
                d.setUTCHours(0, 0, 0, 0); d.setUTCDate(1); break;
            case 'quarter':
                d.setUTCHours(0, 0, 0, 0); d.setUTCDate(1);
                d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3); break;
            case 'year':
                d.setUTCHours(0, 0, 0, 0); d.setUTCDate(1); d.setUTCMonth(0); break;
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
            case 'day': d.setUTCDate(d.getUTCDate() + amount); return d.getTime();
            case 'week': d.setUTCDate(d.getUTCDate() + amount * 7); return d.getTime();
            case 'month': d.setUTCMonth(d.getUTCMonth() + amount); return d.getTime();
            case 'quarter': d.setUTCMonth(d.getUTCMonth() + amount * 3); return d.getTime();
            case 'year': d.setUTCFullYear(d.getUTCFullYear() + amount); return d.getTime();
            default: return ts + amount;
        }
    }

    var adapters = Chart._adapters;
    if (!adapters || !adapters._date) {
        console.warn('[chartjs-adapter-simple] Chart._adapters._date not found.');
        return;
    }

    adapters._date.override({
        _id: 'simple-date-adapter-utc',

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
})();

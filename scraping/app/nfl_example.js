var q = require('bluebird');
var request = require('request-promise');
var cheerio = require('cheerio');
var cheerio_adv = require('cheerio-advanced-selectors');
var querystring = require('querystring');
var url = require('url');
var json2csv = require("json2csv");
var fs = require('fs');
var misc = require('./helpers/misc');
var baseurl = "http://www.nfl.com/players/search?category=lastName&playerType=current";
var output = [];
var pqueue = [];
var pagination = [{
    type: 'paginate',
    param: 'filter',
    data: function(paginate) {
        var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
        return typeof alphabet[paginate.index] != 'undefined' ? alphabet[paginate.index++] : false;
    },
    required: true,
    index: 0,
    max: 25,
    child: {
        type: 'range',
        param: 'd-447263-p',
        data: function(paginate) {
            return paginate.index < paginate.max ? ++paginate.index : false;
        },
        required: false,
        index: 0,
        max: 20
    }
}];
var schema = {
    root: '#result TBODY TR[class]',
    fields: [{
        label: 'Pos',
        selector: 'TD:eq(0)',
        default: 'N/A'
    }, {
        label: 'Num',
        selector: 'TD:eq(1)',
        default: 'N/A'
    }, {
        label: 'Player Name',
        selector: 'TD:eq(2) A',
        default: 'N/A'
    }, {
        label: 'Status',
        selector: 'TD:eq(3)',
        default: 'N/A'
    }, {
        label: 'Quick Stat 1',
        selector: 'TD:eq(4)',
        default: 'N/A'
    }, {
        label: 'Quick Stat 2',
        selector: 'TD:eq(5)',
        default: 'N/A'
    }, {
        label: 'Quick Stat 3',
        selector: 'TD:eq(6)',
        default: 'N/A'
    }, {
        label: 'Quick Stat 4',
        selector: 'TD:eq(7)',
        default: 'N/A'
    }, {
        label: 'Quick Stat 5',
        selector: 'TD:eq(8)',
        default: 'N/A'
    }, {
        label: 'Quick Stat 6',
        selector: 'TD:eq(9)',
        default: 'N/A'
    }, {
        label: 'Quick Stat 7',
        selector: 'TD:eq(10)',
        default: 'N/A'
    }, {
        label: 'Quick Stat 8',
        selector: 'TD:eq(11)',
        default: 'N/A'
    }, {
        label: 'Team',
        selector: 'TD:eq(12) A',
        default: 'N/A'
    }, ]
};
var headings = schema.fields.map(function(f) {
    return f.label;
});
var build = function(paginate, uri) {
    var t = paginate.type;
    var p = paginate.param;
    var c = paginate.child === undefined ? false : paginate.child;
    var s = ((uri.indexOf('?') == -1) ? '?' : '&');
    var d = paginate.data;
    var i = paginate.index;
    var q = querystring.parse(url.parse(uri).query);
    var v;
    if (typeof q[p] == 'undefined') {
        if (c) {
            c.index = 0;
        }
        switch (t) {
            case 'paginate':
                v = d(paginate);
                if (v) {
                    uri += s + p + '=' + v;
                }
                break;
            case 'range':
                v = d(paginate);
                if (v) {
                    uri += s + p + '=' + v;
                }
                break;
        }
    }
    if (c) {
        if (typeof q[c.param] != 'undefined') {
            delete q[c.param];
            uri = uri.split('?')[0] + '?' + querystring.stringify(q);
        }
        uri = build(c, uri);
    }
    return uri;
};
var parser = function($) {
    cheerio_adv.find($, schema.root).each(function() {
        var d = {};
        $player = $(this);
        schema.fields.forEach(function(stat) {
            var val = cheerio_adv.find($, stat.selector, $player, schema.root).length > 0 ? cheerio_adv.find($, stat.selector, $player, schema.root).text() : stat.default;
            d[stat.label] = val.trim();
        });
        output.push(d);
        return d;
    });
};
var checkURI = function(paginate, uri, cb) {
    uri = build(paginate, uri);
    misc.checkUrlExists(uri, cb, paginate);
};
var queueParser = function(uri, paginate) {
    var t = function(body) {
        return cheerio.load(body);
    };
    var e = function(err) {
        // console.log(err.message);
    };
    pqueue.push(request({
        uri: uri,
        transform: t
    }).then(parser).catch(e));
    if (typeof paginate.child != 'undefined') {
        while (paginate.child.index != paginate.child.max) {
            uri = build(paginate, uri);
            pqueue.push(request({
                uri: uri,
                transform: t
            }).then(parser).catch(e));
        }
    }
};
for (var p in pagination) {
    var paginate = pagination[p];
    var i = 0;
    var j = 0;
    var found = false;
    do {
        var uri = build(paginate, baseurl);
        queueParser(uri, paginate);
        j++;
    } while (j <= paginate.max);
}
//q.all will wait for all to complete
q.all(pqueue).then(function(res) {
    if (output && headings) {
        json2csv({
            data: output,
            fields: headings
        }, function(err, csv) {
            if (err) console.log(err);
            fs.writeFile('players.csv', csv, function(err) {
                if (err) throw err;
                console.log('file saved: players.csv!');
            });
        });
    } else {
        console.log('no data could be extacted!')
    }
});
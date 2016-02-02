var fs = require('fs');
var http = require('http');
var url = require('url');
var querystring = require('querystring');
var request = require('request');
var archiver = require('archiver');
var resumer = require('resumer');
var collect = require('collect-stream');
var unzip = require('unzip');

var summarize = require('./summarize');

function copy(o, p) {
  var c = {};
  for (var key in o) {
    c[key] = o[key];
  }
  for (var key in p) {
    c[key] = p[key];
  }
  return c;
}

var cors = {
  'Access-Control-Allow-Origin': '*'
};

http.createServer(function(req, res) {

  var u = url.parse(req.url);

  var path =
    u.pathname === '/' || u.pathname === '/index.html' ? '/index.html' :
    u.pathname === '/crossdomain.xml' ? '/crossdomain.xml' :
    null;

  if (path != null) {
    fs.readFile(__dirname + path, function(err, data) {
      if (err || !data) {
        res.writeHead(500, cors);
        return res.end();
      }

      res.writeHead(200, copy(cors, {'Content-Type': path.split('.').pop() === 'html' ? 'text/html' : 'text/x-cross-domain-policy'}));
      res.end(data);
    });
    return;
  }

  var match = /(\d+)(?:\.(zip|txt|json))?/.exec(u.pathname);
  if (!match) {
    res.writeHead(404, cors);
    return res.end();
  }

  var id = +match[1];
  var q = querystring.parse(u.query);

  var ext = match[2] || 'sb2';
  var zip = ext === 'zip' || q.zip != null;
  var txt = ext === 'txt';
  var json = ext === 'json';

  request('http://projects.scratch.mit.edu/internalapi/project/' + id + '/get/', {encoding: null}, function(err, r, body) {
    if (err) {
      res.writeHead(500, cors);
      return res.end();
    }
    if (r.statusCode !== 200) {
      res.writeHead(404, cors);
      return res.end();
    }

    var headers = copy(cors, {
      'Content-Type': zip ? 'application/zip' : json ? 'application/json' : txt ? 'text/plain' : 'application/octet-stream',
      'Content-Disposition': 'attachment;filename=' + id + '.' + ext
    });

    try {
      var project = JSON.parse(body);
    } catch (e) {
      if (!txt && !json) {
        res.writeHead(200, headers);
        return res.end(body);
      }
      resumer().queue(body).end().pipe(unzip.Parse()).on('entry', function(entry) {
        if (!/\.json$/.test(entry.path)) return;
        collect(entry, function(err, body2) {
          if (err) {
            res.writeHead(500, cors);
            return res.end();
          }
          if (json) {
            res.writeHead(200, headers);
            return res.end(body2);
          }
          try {
            var project = JSON.parse(body2);
          } catch (e) {
            res.writeHead(500, cors);
            return res.end();
          }
          res.writeHead(200, headers);
          summarize(res).project(project);
          res.end();
        });
      });
      return;
    }

    res.writeHead(200, headers);

    if (txt) {
      summarize(res).project(project);
      return res.end();
    }
    if (json) {
      return res.end(body);
    }

    var nextID = 0;

    function parse(thing) {
      if (thing.costumes) thing.costumes.forEach(function(costume) {
        addResource(costume, 'baseLayerID', costume.baseLayerMD5);
        addResource(costume, 'textLayerID', costume.textLayerMD5);
      });
      if (thing.sounds) thing.sounds.forEach(function(sound) {
        addResource(sound, 'soundID', sound.md5);
      });
      if (thing.children) thing.children.forEach(parse);
    }

    function addResource(thing, id, md5) {
      if (!md5) return;
      thing[id] = ++nextID;
      archive.append(request('http://cdn.assets.scratch.mit.edu/internalapi/asset/' + md5 + '/get/'), { name: nextID + '.' + md5.split('.').pop() });
    }

    var archive = archiver('zip');
    archive.pipe(res);

    parse(project);

    archive.append(JSON.stringify(project), { name: 'project.json' });
    archive.finalize(function() {
      res.end();
    });
  });

}).listen(process.env.PORT || 8080, process.env.HOST);

var fs = require('fs');
var http = require('http');
var url = require('url');
var querystring = require('querystring');
var request = require('request');
var archiver = require('archiver');

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

  var match = /(\d+)(?:\.(zip|txt))?/.exec(u.pathname);
  if (!match) {
    res.writeHead(404, cors);
    return res.end();
  }

  var id = +match[1];
  var q = querystring.parse(u.query);

  var ext = match[2] || 'sb2';
  var zip = ext === 'zip' || q.zip != null;
  var txt = ext === 'txt';

  request('http://projects.scratch.mit.edu/internalapi/project/' + id + '/get/', {encoding: null}, function(err, r, body) {
    if (err) {
      res.writeHead(500, cors);
      return res.end();
    }
    if (r.statusCode !== 200) {
      res.writeHead(404, cors);
      return res.end();
    }

    res.writeHead(200, copy(cors, {
      'Content-Type': zip ? 'application/zip' : txt ? 'text/plain' : 'application/octet-stream',
      'Content-Disposition': 'attachment;filename=' + id + '.' + ext
    }));

    try {
      var project = JSON.parse(body);
    } catch (e) {
      if (txt) {
        return res.end('Summaries of projects uploaded with the offline editor aren\'t available yet. Check back soon!');
      }
      return res.end(body);
    }

    if (txt) {
      summarize(res).project(project);
      return res.end();
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

    archive.append(body, { name: 'project.json' });
    archive.finalize(function() {
      res.end();
    });
  });

}).listen(process.env.PORT || 8080, process.env.HOST);

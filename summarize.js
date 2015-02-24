
var commands = require('./commands');
var commandMap = Object.create(null);

commands.forEach(function(x) {
  commandMap[x[3]] = {
    parts: parts(x[0]),
    type: x[1] === 'f' ? ' ' : x[1] === 'cf' ? 'c' : x[1]
  };
});

function parts(spec) {
  return spec.replace(/@(\w+)/g, function(_, name) {
    return name === 'greenFlag' ? 'flag' :
      name === 'turnLeft' ? 'left' :
      name === 'turnRight' ? 'right' : '@';
  }).split(/(%\w+)(?:\.\w+)?/).map(function(l, i) {
    return i % 2 ? {type: l.slice(1)} : l;
  }).filter(function(x) {
    return x;
  });
}


function Summarizer(s) {
  this.s = s;
}


Summarizer.prototype.project = function(data) {
  this.sprite(data, true);
  if (Array.isArray(data.children)) {
    data.children.forEach(function(child) {
      if (child.objName) {
        this.w('\n\n');
        this.sprite(child);
      }
    }, this);
  }
};

Summarizer.prototype.sprite = function(data, isStage) {
  this.h1(data.objName);
  if (Array.isArray(data.variables) && data.variables.length) {
    this.h2('Variables');
    data.variables.forEach(function(variable) {
      this.l('- '+variable.name+' = '+variable.value);
    }, this);
    this.l();
  }
  if (Array.isArray(data.lists) && data.lists.length) {
    this.h2('Lists');
    data.lists.forEach(function(list) {
      if (Array.isArray(list.contents)) {
        this.l('- '+list.listName+(list.contents.length ? ':' : ''));
        list.contents.forEach(function(item) {
          this.l('    - '+item);
        }, this);
      }
    }, this);
    this.l();
  }
  this.h2(isStage ? 'Backdrops' : 'Costumes');
  if (Array.isArray(data.costumes)) {
    data.costumes.forEach(function(costume) {
      this.l('- '+costume.costumeName);
    }, this);
  }
  this.l();
  if (Array.isArray(data.sounds) && data.sounds.length) {
    this.h2('Sounds');
    data.sounds.forEach(function(sound) {
      this.l('- '+sound.soundName);
    }, this);
    this.l();
  }
  if (Array.isArray(data.scripts) && data.scripts.length) {
    this.h2('Scripts');
    data.scripts.forEach(function(script) {
      if (Array.isArray(script)) {
        this.script(script[2]);
        this.l();
      }
    }, this);
  }
};


Summarizer.prototype.script = function(blocks, indent) {
  if (!Array.isArray(blocks)) return;
  blocks.forEach(function(b) {
    this.block(b, indent);
    this.l();
  }, this);
};

Summarizer.prototype.block = function(block, indent) {
  if (!Array.isArray(block)) return;
  if (indent) this.w(indent);
  var sel = block[0];
  if ((sel === 'readVariable' || sel === 'getParam' || sel === 'contentsOfList:') && typeof block[1] === 'string') {
    var type =
      sel === 'getParam' ? ' :: custom-arg' :
      sel === 'contentsOfList:' ? ' :: list' : '';
    return this.w('(' + block[1] + type + ')');
  }
  if (sel === 'procDef') {
    var i = 0;
    return this.w('define ' + block[1].replace(/(%\w+)(?:\.\w+)?/g, function() {
      return '(' + block[2][i++] + ')';
    }));
  }
  if (sel === 'call') {
    var command = {
      type: ' ',
      parts: parts(''+block[1])
    };
    var i = 2;
  } else {
    var command = commandMap[sel];
    var i = 1;
  }
  if (!command) return this.w('?');

  var t = command.type;
  if (t === 'r') this.w('(');
  else if (t === 'b') this.w('<');

  command.parts.forEach(function(part) {
    if (typeof part === 'string') {
      this.w(part);
    } else {
      this.arg(part.type, block[i++]);
    }
  }, this);

  if (t === 'r') this.w(')');
  else if (t === 'b') this.w('>');
  else if (t === 'c' || t === 'e') {
    indent = indent || '';
    var more = indent + '    ';
    this.l();
    this.script(block[block.length - (t === 'e' ? 2 : 1)], more);
    if (t === 'e') {
      this.l(indent + 'else');
      this.script(block[block.length - 1], more);
    }
    this.w(indent + 'end');
  }
};

Summarizer.prototype.arg = function(type, value) {
  if (Array.isArray(value)) {
    return this.block(value);
  }
  var start = type === 'n' || type === 'd' ? '(' : '[';
  var end = type === 'n' ? ')' : type === 'd' ? ' v)' : type === 'm' ? ' v]' : ']';
  if (type === 'c' && typeof value === 'number') {
    value = value.toString(16);
    value = '#' + '000000'.slice(value.length) + value;
  } else if (type === 'm') {
    if (value === '_edge_') value = 'edge';
    if (value === '_mouse_') value = 'mouse-pointer';
    if (value === '_myself_') value = 'myself';
    if (value === '_stage_') value = 'Stage';
  }
  this.w(start + value + end);
};


Summarizer.prototype.w = function(string) {
  this.s.write(string);
};
Summarizer.prototype.l = function(string) {
  this.s.write(string == null ? '\n' : string + '\n');
};
Summarizer.prototype.h = function(ch, title) {
  title = ''+title;
  this.l(title);
  this.l(Array(title.length+1).join(ch));
  this.l();
};
Summarizer.prototype.h1 = function(title) {
  this.h('=', title);
};
Summarizer.prototype.h2 = function(title) {
  this.h('-', title);
};


module.exports = function(s) {
  return new Summarizer(s);
};

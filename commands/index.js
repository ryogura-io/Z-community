const helpCommand = require('./help');
const adminCommands = require('./admin');
const groupCommands = require('./group');
const mediaCommands = require('./media');
const utilityCommands = require('./utility');
const gameCommands = require('./games');
const downloaderCommands = require('./downloaders');
const cards = require("./cards");

// Combine all commands
const rawCommands = {
    ...helpCommand,
    ...adminCommands,
    ...groupCommands,
    ...mediaCommands,
    ...utilityCommands,
    ...gameCommands,
    ...downloaderCommands,
    ...cards,
};

const commands = {};
// register commands and aliases
for (const [name, cmd] of Object.entries(rawCommands)) {
  commands[name] = cmd;

  if (cmd.aliases && Array.isArray(cmd.aliases)) {
    for (const alias of cmd.aliases) {
      commands[alias] = cmd; // 👈 alias points to same command object
    }
  }
}

module.exports = commands;

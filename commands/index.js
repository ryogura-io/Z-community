const helpCommand = require('./help');
const adminCommands = require('./admin');
const groupCommands = require('./group');
const mediaCommands = require('./media');
const utilityCommands = require('./utility');
const gameCommands = require('./games');
const downloaderCommands = require('./downloaders');
const cards = require("./cards");
const card2Commands = require('./card2');
const economyCommands = require('./economy');
const familiaCommands = require('./familia');
const coreCommands = require('./core');
const moderatorCommands = require('./moderator');

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
    ...card2Commands,
    ...economyCommands,
    ...familiaCommands,
    ...coreCommands,
    ...moderatorCommands,
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

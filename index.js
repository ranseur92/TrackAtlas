const Discord = require('discord.io');
const auth = require('./auth.json');
const Table = require('easy-table');
const sqlite3 = require('sqlite3').verbose();
const parse = require('minimist-string');
const db = new sqlite3.Database('./tracker');

function createTable() {
    db.serialize(function() {
        db.each("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='resources'", (err, row) => {
            if (row.count === 0) {
                db.run("CREATE TABLE IF NOT EXISTS resources (id INTEGER PRIMARY KEY, resource TEXT, region TEXT, island TEXT, description TEXT)", () => {
                    createResource({
                        resource: "Ruby",
                        region: "K5", 
                        island: "SE", 
                        description: "West coast"
                    });
                });
            }
        })
    });
}

function createResource({resource, region, island, description}) {
    var stmt = db.prepare("INSERT INTO resources (resource, region, island, description) VALUES (?, ?, ?, ?)");
    stmt.run(resource, region, island, description);
    stmt.finalize();
}

function updateResource({id, resource, region, island, description}) {
    var stmt = db.prepare("UPDATE resources SET resource = ?, region = ?, island = ?, description = ? where id = ?");
    stmt.run(resource, region, island, description, id);
    stmt.finalize();
}

createTable();

var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});

const COMMANDS = {
    addResource: {
        params: ['resource', 'region', 'island', 'description'],
        action: function(query) {
            const id = createResource(query);
            this.post(`Added Resource #${id} \`\`\`${JSON.stringify(query, null, 4)}\`\`\``);
        }
    },
    editResource: {
        params: ['id', 'resource', 'region', 'island', 'description'],
        action: function(query) {
            updateResource(query);
            this.post(`Updated Resource #${query.id} \`\`\`${JSON.stringify(query, null, 4)}\`\`\``);
        }
    },
    whereIs: {
        params: ['resource'],
        action: function(query) {
            db.all(`SELECT * FROM resources where resource like '%${query.resource}%'`, (err, results) => {
                this.postResults(results);
            });
        }
    },
    removeResource: {
        params: ['id'],
        action: function(query) {
            db.all(`DELETE FROM resources where id = ?`, [query.id], (err, results) => {
                console.log(err, results)
            });
        }
    },
    listResources: function() {
        db.all(`SELECT * FROM resources`, (err, results) => {
            this.postResults(results);
        });
    }
}

function printHelp() {
    let message = "```Usage: !<command> [options]\n\nCommands:";

    Object.keys(COMMANDS).map(cmd => {
        const command = COMMANDS[cmd];
        const usage = !command.params ? '' : command.params.map(a => `<${a}>`).join(' '); 
        message += `\n\t!${cmd} ${usage}`
    })

    message += `\n\t!help`
    message += "```"
    this.post(message);
}

class Context {

    constructor(channelId) {
        this.channelId = channelId;
    }

    post(message) {
        if (this.channelId) {
            bot.sendMessage({ to: this.channelId, message });
        } else {
            console.log('[MSG]:', message);
        }
    }

    postResults(results) {
        if (results.length > 0) {
            const table = new Table();
            for(let result of results) {
                for (let key of Object.keys(result)) {
                    table.cell(key, result[key])
                }
                table.newRow()
            }
            this.post(`\`\`\`${table.toString()}\`\`\``)
        } else {
            this.post(`No resources found.`)
        }
    }
}

function handleMessage(message, channelId) {
    if (message.indexOf('!') === 0) {
        const parsed = parse(message)._;
        const _command = parsed[0].substring(1);
        const _args = parsed.splice(1);
        const context = new Context(channelId);

        if (_command.indexOf('help') === 0) {
            printHelp.bind(context)();
        } else {
            const command = COMMANDS[_command];
            if (command) {
                if (typeof command === 'function') {
                    command.bind(context)(_args);
                } else {
                    if (command.params && _args.length !== command.params.length) {
                        context.post(`Missing Parameter '${command.params[_args.length]}'. Usage: '!${_command} ${command.params.map(a => `<${a}>`).join(' ')}'`)
                        return;
                    }
                    command.action.bind(context)(command.params.reduce((acc, val, index) => {
                        return { ...acc, [val]: _args[index] };
                    }, {}))
                }
            }
        }
    }

}

bot.on('message', function (user, userID, channelId, message, evt) {
    handleMessage(message, channelId);
});
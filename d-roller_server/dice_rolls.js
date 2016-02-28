/** Maximum times a dice can be rolled. (Done to reduce spam of the chat room. No sane person would need more.) */
const MAX_DICE_TIMES = 20;

const io = require('socket.io')(8081);

/** Player characters. */
var pcs = {};
/** Rooms for parties. */
var parties = {};

io.sockets.on('connection', function(client)
{
        printLog("A user connected");

        pcs[client.id] = {};

        client.on("createJoinPartyAndRegisterName", function(newName, partyName, partyPassphrase)
        {
                registerName(client, newName);

                if(canCreatePartyName(partyName))
                {
                        printLog(newName + " creates party " + partyName + " with passphrase " + partyPassphrase);

                        client.join(partyName);
                        parties[partyName] = {party:{}, passphrase:partyPassphrase};
                        parties[partyName].party[client.id] = pcs[client.id];
                        pcs[client.id].party = partyName;

                        client.emit("partyCreated", partyName, parties[partyName].party); // emit party name and party members
                }
                else
                {
                        if(parties[partyName].passphrase == partyPassphrase)       // if passphrases match, allow login.
                        {
                                printLog(newName + " logins to party " + partyName + " with passphrase " + partyPassphrase + " matching " + parties[partyName].passphrase);

                                client.join(partyName);
                                parties[partyName].party[client.id] = pcs[client.id];
                                pcs[client.id].party = partyName;

                                client.emit("partyLoggedIn", partyName, parties[partyName].party);
                        }
                        else    // can not log in
                        {
                                printLog(newName + " rejected from party " + partyName + " with passphrase " + partyPassphrase + " matching " + parties[partyName].passphrase);

                                client.emit("rejectedLogIn");
                        }
                }
        });

        client.on("leaveParty", function()
        {
                if(pcs[client.id].party)
                {
                    printLog(pcs[client.id].name + " is leaving party " + pcs[client.id].party);
                    removePCFromParty(client.id, pcs[client.id].party);
                    delete pcs[client.id].party;
                }
                else
                {
                    printWarning(pcs[client.id].name + " doesn't belong to a party to exit."); // error
                }
        });

        /**
         * Sends a message to all party members.
         */
        client.on("partyMsg", function(newMessage)
        {
                printLog(pcs[client.id].name + " is messaging party");
                if(pcs[client.id].party)
                {
                     //TODO: manimulate dice rolls.
                    
                    var partyName = pcs[client.id].party;
                    io.to(partyName).emit("partyMsg", pcs[client.id].name, newMessage);
                }
        });

        /**
         * Remove client from the server and the party he joined.
         */
        client.on("disconnect", function()
        {
                printLog(pcs[client.id].name + " disconnected");
                if(pcs[client.id].party)        // if pc was in a room
                {
                        removePCFromParty(client.id, pcs[client.id].party);
                }

                delete pcs[client.id];
        });
});

/**
 * Removes pc from party.
 */
function removePCFromParty(clientId, partyName)
{
    if(parties.hasOwnProperty(partyName))
    {
        delete parties[partyName].party[clientId];  // remove from room
        if(Object.keys(parties[partyName].party).length == 0)      // check if room is empty
        {
                printLog("Party " + partyName + " is disbanded.");
                delete parties[partyName];      // if room is empty, destroy room
        }
        else
        {
                io.to(parties[partyName]).emit("partyMemberLeft", parties[partyName].party, pcs[clientId].name);       // emit current party members and the name of the one who left.
        }
    }
    else   
    {
        printLog("Party " + partyName + " is already disbanded");
    }
}

/**
 * Rolls multiple dice.
 * @returns An array of the result of all dice cast.
 */
function multipleRolls(times, maxRoll)
{
    times = Math.min(MAX_DICE_TIMES, times);

    var results = [];
    for (var i = times; i >= 0; i--) {
        results.push(roll(maxRoll));
    }

    return results;
}

/**
 * @returns A random roll from 1 to the maxRoll parameter.
 */
function roll(maxRoll)
{
    return Math.floor((Math.random() * maxRoll) + 1);
}

function registerName(client, newName)
{
        pcs[client.id].name = newName;
}

/**
 * @returns True if the party can be created, false if not.
 */
function canCreatePartyName(partyName)
{
        return !parties.hasOwnProperty(partyName);
}

/**
 * Returns the length of keys the object includes and their names.
 */
function debugObject(objectVar)
{
    printLog("Object contains keys: " + Object.keys(objectVar).length);
    for (var key in objectVar)
    {
        printLog("Key: " + key);
    }
}

function printLog(message)
{
        console.log(message);
}

function printWarning(message)
{
    console.log("Warning: " + message);
}
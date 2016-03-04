/** Maximum times a dice can be rolled. (Done to reduce spam of the chat room. No sane person would need more.) */
const MAX_DICE_TIMES = 20;

/** Used for communication with the server. */
const io = require('socket.io')(8081);
/** Used to log information about the app running. */
var winston = require('winston');
/** App version. */
const version = "1.0.2";

winston.add(winston.transports.File, { filename: '/home/user/nodejs_projects/logs/dice_roller_' + new Date().getTime() + '.log' });

/** Player characters. {name, party} */
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

                io.to(partyName).emit("partyMemberJoined", pcs[client.id].name);
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
            var partyName = pcs[client.id].party;
            printLog(pcs[client.id].name + " is leaving party " + partyName);
            client.leave(partyName);
            removePCFromParty(client.id, partyName);
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
        var pcName = pcs[client.id].name;
        printLog(pcName + " is messaging party");
        if(pcs[client.id].party)
        {
            var partyName = pcs[client.id].party;
            
            io.to(partyName).emit("partyMsg", pcName, newMessage);
            
            checkRollsInText(newMessage, pcName, partyName);
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
            io.to(partyName).emit("partyMemberLeft", pcs[clientId].name);       // emit current party members and the name of the one who left.
        }
    }
    else   
    {
        printLog("Party " + partyName + " is already disbanded");
    }
}

/**
 * Checks text if it contains any possible rolls, which checks in function getRoll.
 * If rolls are returned it sends an array of them back to the party.
 * @param text  The string to check for rolls.
 * @param pcName    The name of the player character that makes the rolls
 * @param partyName The party name to send the rolls to.
 */
function checkRollsInText(text, pcName, partyName) 
{
    var rolls = [];
	var dIndex = 0;
    var rollObj= {};
    var textLC = text.toLowerCase();
	while((dIndex = textLC.indexOf('d', dIndex)) != -1)	// Search for d
	{
		rollObj = getRoll(dIndex, text);
		if(rollObj.success)
		{
			rolls.push(rollObj);
		}
		
		dIndex++;
	}
    
    if(rolls.length > 0)
    {
        printLog(rolls.length + " roll(s) parsed");
        io.to(partyName).emit("rolls", pcName, rolls);
    }
}

/**
 * Checks in given text the index passed for a roll. The roll may or may not exist.
 * @param dIndex    An integer of the index the roll was detected. This is a 'd'.
 * @param text  The text to parse for the roll.
 * @returns An object with the roll information. Key 'success' will be false if there is no roll.
 */
function getRoll(dIndex, text)
{
    var rollObj = {success:false};
    // Check if dice roll
    var diceIndexStart = dIndex+1;
    var diceIndexEnd = dIndex+1;
    while(!isNaN(parseInt(text.substr(diceIndexEnd, 1))))
    {
        diceIndexEnd++;
    }
    
    if(diceIndexEnd > diceIndexStart)	// check if is roll
    {
        // Check times rolled
        var maxRoll = parseInt(text.substring(diceIndexStart, diceIndexEnd));
        var times = 1;
        
        var timesIndexEnd = dIndex - 1;
        var timesIndexStart = dIndex - 1;
        
        while(diceIndexStart > 0 && !isNaN(parseInt(text.charAt(timesIndexStart))))
        {
            timesIndexStart--;
        }
        
        if(timesIndexStart != timesIndexEnd)
        {
            times = parseInt(text.substring(timesIndexStart, timesIndexEnd+1));
        }
        
        // Check for modifiers. check is done only at suffixes.
        var modifierCharIndex = diceIndexEnd;
        var modifierNumber = 0;
        while(modifierCharIndex < text.length)
        {
            var char = text.charAt(modifierCharIndex);
            
            if(char == '+' || char == '-')	// there is a modifier!
            {
                var numberIndex = modifierCharIndex+1;
                while(numberIndex < text.length)	// Does a number follow?
                {
                    var numberChar = text.charAt(numberIndex)
                    if(!isNaN(parseInt(numberChar)))	// There is a number! Get it!
                    {
                        modifierNumber = parseInt(text.substr(numberIndex).match(/\d+/)[0]);
                        if(char == '-')
                            modifierNumber *= -1;
                        break;
                    }
                    else	// No modifiers it seems
                    {
                        break;
                    }
                }
                break;	// No need to search further.
            }
            else	// No modifier.
            {
                break;
            }
        }
        
        // Show rolls
        rollObj.rolls = multipleRolls(times, maxRoll);
        rollObj.modifier = modifierNumber;
        rollObj.success = true;
    }
    
    return rollObj;
}

/**
 * Rolls multiple dice.
 * @returns An array of the result of all dice cast.
 */
function multipleRolls(times, maxRoll)
{
    times = Math.min(MAX_DICE_TIMES, times);

    var results = [];
    for (var i = times - 1; i >= 0; i--) {
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
    winston.log('info', message);
}

function printWarning(message)
{
    console.log("Warning: " + message);
    winston.log('warn', message);
}
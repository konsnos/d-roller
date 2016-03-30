/** Maximum times a dice can be rolled. (Done to reduce spam of the chat room. No sane person would need more.) */
const MAX_DICE_TIMES = 20;

/** If these characters exist before or after the roll don't abort the roll. Otherwise it's probaly a text. */
const IGNORE_ABORT_CHARACTERS = ['+','-',',',' '];

/** Used for communication with the server. */
const io = require('socket.io')(8081);
/** Used to log information about the app running. */
var winston = require('winston');
/** App version. */
const version = "1.0.5";

/** TODO: Path should become relative. */
winston.add(winston.transports.File, {
    filename: '/home/user/nodejs_projects/logs/dice_roller_' + new Date().getTime() + '.log'
});

/** Player characters. {name, party} */
var pcs = {};
/** Rooms for parties. */
var parties = {};

io.sockets.on('connection', function(client) {
    printLog("A user connected");

    pcs[client.id] = {};

    client.on("createJoinPartyAndRegisterName", function(newName, partyName, partyPassphrase) {
        registerName(client, newName);

        if (canCreatePartyName(partyName)) {
            printLog(newName + " creates party " + partyName + " with passphrase " + partyPassphrase);

            client.join(partyName);
            parties[partyName] = {
                party: {},
                passphrase: partyPassphrase
            };
            parties[partyName].party[client.id] = pcs[client.id];
            pcs[client.id].party = partyName;

            client.emit("partyCreated", partyName, parties[partyName].party); // emit party name and party members
        } else {
            if (parties[partyName].passphrase == partyPassphrase) // if passphrases match, allow login.
            {
                printLog(newName + " logins to party " + partyName + " with passphrase " + partyPassphrase + " matching " + parties[partyName].passphrase);

                client.join(partyName);
                parties[partyName].party[client.id] = pcs[client.id];
                pcs[client.id].party = partyName;

                io.to(partyName).emit("partyMemberJoined", pcs[client.id].name);
                client.emit("partyLoggedIn", partyName, parties[partyName].party);
            } else // can not log in
            {
                printLog(newName + " rejected from party " + partyName + " with passphrase " + partyPassphrase + " matching " + parties[partyName].passphrase);

                client.emit("rejectedLogIn");
            }
        }
    });

    client.on("leaveParty", function() {
        if (pcs[client.id].party) {
            var partyName = pcs[client.id].party;
            printLog(pcs[client.id].name + " is leaving party " + partyName);
            client.leave(partyName);
            removePCFromParty(client.id, partyName);
            delete pcs[client.id].party;
        } else {
            printWarning(pcs[client.id].name + " doesn't belong to a party to exit."); // error
        }
    });

    /**
     * Sends a message to all party members.
     */
    client.on("partyMsg", function(newMessage) {
        var pcName = pcs[client.id].name;
        printLog(pcName + " is messaging party");
        if (pcs[client.id].party) {
            var partyName = pcs[client.id].party;

            io.to(partyName).emit("partyMsg", pcName, newMessage);

            checkRollsInText(newMessage.toLowerCase(), pcName, partyName);
        }
    });

    /**
     * Remove client from the server and the party he joined.
     */
    client.on("disconnect", function() {
        printLog(pcs[client.id].name + " disconnected");
        if (pcs[client.id].party) // if pc was in a room
        {
            removePCFromParty(client.id, pcs[client.id].party);
        }

        delete pcs[client.id];
    });
});

/**
 * Removes pc from party.
 */
function removePCFromParty(clientId, partyName) {
    if (parties.hasOwnProperty(partyName)) {
        delete parties[partyName].party[clientId]; // remove from room
        if (Object.keys(parties[partyName].party).length == 0) // check if room is empty
        {
            printLog("Party " + partyName + " is disbanded.");
            delete parties[partyName]; // if room is empty, destroy room
        } else {
            io.to(partyName).emit("partyMemberLeft", pcs[clientId].name); // emit current party members and the name of the one who left.
        }
    } else {
        printLog("Party " + partyName + " is already disbanded");
    }
}

/**
 * Checks text if it contains any possible rolls, which checks in function getRoll.
 * If rolls are returned it sends an array of them back to the party.
 * @param text  The string to check for rolls. Must be lowercase.
 * @param pcName    The name of the player character that makes the rolls
 * @param partyName The party name to send the rolls to.
 */
function checkRollsInText(text, pcName, partyName) {
    var rolls = [];
    var dIndex = 0;
    var rollObjArr = [];
    var rollObj = {};
    while ((dIndex = text.indexOf('d', dIndex)) != -1) // Search for d
    {
        rollObjArr = getRoll(dIndex, text, true);
        rollObj = rollObjArr[0];
        if (rollObj.success) {
            rolls.push(rollObj);
            dIndex = rollObjArr[1];
        } else {
            dIndex++;
        }
    }

    if (rolls.length > 0) {
        printLog(rolls.length + " roll(s) parsed");
        io.to(partyName).emit("rolls", pcName, rolls);
    }
}

/**
 * Checks how many consequative numbers there are after the index to the text, parses them and returns them.
 * @returns An array containing the number found and the end index.
 */
function getNumbers(forward, index, text) {
    // The end index is the start index if the search is done backwards.
    var endIndex = index;
    var aNumber = 0;

    if (forward) {
        endIndex = index;

        while (!isNaN(parseInt(text.substr(endIndex, 1)))) {
            endIndex++;
        }

        if (endIndex > index) {
            aNumber = parseInt(text.substring(index, endIndex));
        }
    } else {
        endIndex = index - 1;
        if ((index + 1) > 0) {
            while (!isNaN(parseInt(text.charAt(endIndex)))) {
                endIndex--;
            }
        }

        if (endIndex < index - 1) {
            aNumber = parseInt(text.substring(endIndex + 1, index));
        }
    }

    return [aNumber, endIndex];
}

/**
 * Checks in given text the index passed for a roll. The roll may or may not exist.
 * @param dIndex    An integer of the index the roll was detected. This is a 'd'.
 * @param text  The text to parse for the roll.
 * @param positive  This is supplied
 * @returns An object with the roll information. Key 'success' will be false if there is no roll.
 */
function getRoll(dIndex, text, positive) {
    var rollObj = {
        success: false
    };

    // Check if the rolls is done with fudge dice
    var isFudge = text[dIndex + 1] == 'f';

    var maxRollArr
    if (isFudge) {
        maxRollArr = [6, dIndex + 2];
    } else {
        maxRollArr = getNumbers(true, dIndex + 1, text);
    }

    if (maxRollArr[0] != 0) // check if is roll
    {
        // Ensure that a suffix letter doesn't exist and is not part of a word.
        // This is not done for modifiers as it would be overkill. If modifiers are added then it sure is a roll.
        if (maxRollArr[1] < text.length)
        {
            if(IGNORE_ABORT_CHARACTERS.indexOf(text[maxRollArr[1]]) == -1) {
                return [rollObj];
            }
        }
                
        // Check times rolled
        var maxRoll = maxRollArr[0];
        var times = 1;

        var timesArr = getNumbers(false, dIndex, text);

        if (timesArr[0] != 0) {
            times = timesArr[0];
        }
        
        // Ensure that a preffix letter don't exist and is not part of a word.
        if(timesArr[1] >= 0)
        {
            if(IGNORE_ABORT_CHARACTERS.indexOf(text[timesArr[1]]) == -1) {
                return [rollObj];
            }
        }

        // Check for modifiers. check is done only at suffixes.
        var modifierCharIndex = maxRollArr[1];
        var modifierNumber = 0;
        var modifierRollsArr = [{
            success: false
        }];
        while (modifierCharIndex < text.length) {
            var char = text.charAt(modifierCharIndex);

            if (char == '+' || char == '-') // there is a modifier!
            {
                var modifierSign = (char == '+') ? 1 : -1;
                var numberIndex = modifierCharIndex + 1;
                while (numberIndex < text.length) // Does a number follow?
                {
                    var numberChar = text.charAt(numberIndex);
                    if (!isNaN(parseInt(numberChar))) // There is a number! Get it!
                    {
                        //modifierNumber = parseInt(text.substr(numberIndex).match(/\d+/)[0]);
                        var modArr = getNumbers(true, numberIndex, text);

                        if (text.charAt(modArr[1]) == 'd') {
                            modifierRollsArr = getRoll(modArr[1], text, modifierSign > 0);
                        }

                        if (!modifierRollsArr[0].success) {
                            modifierNumber = modArr[0] * modifierSign;
                        }
                        break;
                    } else if (numberChar == 'd') {
                        modifierRollsArr = getRoll(numberIndex, text, modifierSign > 0);

                        break;
                    } else // No modifiers it seems
                    {
                        break;
                    }
                }
                break; // No need to search further.
            } else // No modifier.
            {
                break;
            }
        }

        // Show rolls
        rollObj.rolls = multipleRolls(times, maxRoll, positive);
        if (isFudge) {
            rollObj.rolls = modifyToFudgeRolls(rollObj.rolls);
        }
        var lastIndex;
        if (modifierRollsArr[0].success) {
            rollObj.rolls = rollObj.rolls.concat(modifierRollsArr[0].rolls);
            rollObj.modifier = modifierRollsArr[0].modifier;

            lastIndex = modifierRollsArr[1];
        } else {
            rollObj.modifier = modifierNumber;

            lastIndex = maxRollArr[1];
        }
        rollObj.success = true;
    }

    return [rollObj, lastIndex];
}

/**
 * Modifies d6 rolls to df.
 * 5, 6 become +1, 3,4 become +0, 1,2 become -1.
 */
function modifyToFudgeRolls(rolls) {
    for (var i = rolls.length - 1; i >= 0; i--) {
        switch (rolls[i]) {
            case 1:
            case 2:
                rolls[i] = -1;
                break;
            case 3:
            case 4:
                rolls[i] = 0;
                break;
            case 5:
            case 6:
                rolls[i] = 1;
                break;
            default:
                printWarning("Uknown dice roll for fudge: " + rolls[i]);
                break;
        }
    }

    return rolls;
}

/**
 * Rolls multiple dice.
 * param positive	If the rolls are positive or negative numbers they are modified accordingly. This is used for modifiers.
 * @returns An array of the result of all dice cast.
 */
function multipleRolls(times, maxRoll, positive) {
    times = Math.min(MAX_DICE_TIMES, times);

    var results = [];
    for (var i = times - 1; i >= 0; i--) {
        results.push(roll(maxRoll) * (positive ? 1 : -1));
    }

    return results;
}

/**
 * @returns A random roll from 1 to the maxRoll parameter.
 */
function roll(maxRoll) {
    return Math.floor((Math.random() * maxRoll) + 1);
}

function registerName(client, newName) {
    pcs[client.id].name = newName;
}

/**
 * @returns True if the party can be created, false if not.
 */
function canCreatePartyName(partyName) {
    return !parties.hasOwnProperty(partyName);
}

/**
 * Returns the length of keys the object includes and their names.
 */
function debugObject(objectVar) {
    printLog("Object contains keys: " + Object.keys(objectVar).length);
    for (var key in objectVar) {
        printLog("Key: " + key);
    }
}

function printLog(message) {
    //console.log(message);
    winston.log('info', message);
}

function printWarning(message) {
    //console.log("Warning: " + message);
    winston.log('warn', message);
}
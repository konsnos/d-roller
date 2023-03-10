<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>Demo</title>

    <link rel="stylesheet" type="text/css" href="./css/d-roller.css">
    <link rel="stylesheet" type="text/css" href="./css/bootstrap.css">

    <?php include_once("/var/www/vhosts/591736519.linuxzone63.grserver.gr/rpg-gear.com/analyticstracking.php") ?>
    <script src="./js/socket.io.js"></script>
    <script src="./js/jquery-2.2.1.js"></script>
</head>
<body>
   
   <div id="overlay"></div>
    <div id="container">

        <!-- HOME SCREEN -->
        <div id="homeScreen" class="screen">
            <div  id="loginForm" class="form">
                Character name: <br> <input type="text" name="username" id="nameInput">	<br>
                Party name: <br> <input type="text" name="roomname" id="partyNameInput">	<br>
                Passphrase: <br> <input type="text" name="passcode" id="passphraseInput">	<br>
             	<input type="submit" id="submitRoomCreation" value="Create/Join" disabled>
                <div id="homeScreenWarnings">Connecting</div>
            </div>
        </div>
        <!-- END HOME SCREEN -->

        <!-- PLAY SCREEN -->
        <div id="playScreen" class="screen">
            <button id="playScreenBack" class="backButton">Back</button>
            <div id="partyMessages" class="messagesLog">
            <!-- Here the messages are printed. -->
            </div>

            <div class="inputMessage" id="chat">
                <div class="row">
                  <div class="col-xs-12">
                    <div class="input-group input-group-lg">
                        <input type="text" class="form-control" id="inputMessage" placeholder="Your message" maxlength="100" />
                      <div class="input-group-btn">
                        <button class="btn btn-success" id="sendMsgBtn">Send</button>
                        <button class="btn btn-info" id="infoBtn">?</button>
                      </div><!-- /btn-group -->
                    </div><!-- /input-group -->
                  </div><!-- /.col-xs-12 -->
                </div><!-- /.row -->
            </div>
        </div>
        <!-- END PLAY SCREEN -->

    </div>

    <!-- HELP POP UP -->
    <div class="popUp-Help" id="popUpHelp">
        <h3>Let's roll!</h3>
        You can use the input message to type any dice roll. The result of the roll will be shown in the chat messages to all party members. Examples of rolls follow.
        <h4>Basic</h4><hr>
        <ul>
            <li>d6 - Will roll a 6-sided dice</li>
            <li>d20 - Will roll a 20-sided dice</li>
            <li>d87 - Will roll a 87-sided dice (you can use as many sides as you like)</li>
            <li>df - Will roll a fudge dice for a result of +1, 0 or -1</li>
        </ul>
        <h4>Multiple Rolls</h4><hr>
        <ul>
            <li>2d12 - Will roll a 12-sided dice 2 times, and will show the sum of the rolls</li>
            <li>5d10 - Will roll a 12-sided dice 5 times, and will show the sum of the rolls</li>
            <li>4df - Will roll a fudge dice 4 times, and will show the sum of the rolls</li>
        </ul>
        <h4>Modifiers</h4><hr>
        <ul>
            <li>d8-3 - Will roll a 8-sided dice and subtract 3 from the result</li>
            <li>4df+2 - Will roll a fudge dice 4 times and add 2 to the result</li>
            <li>d10+d8 - Will roll a 10-sided dice and add another 8-sided dice to the result</li>
        </ul>
        You can even add more modifiers!<br>
        
        <button type="button" class="btn btn-danger" id="helpCloseBtn">X</button>
    </div>
    <!-- END HELP POP UP -->

    <script>

    const VERSION = "1.0.1";
    const SCREEN_TRANSITION_SPEED = 600;

    var socket = io.connect("http://45.62.224.100:8081");
    var partyMsgsElem = document.getElementById("partyMessages");
    /** If true on received message scroll down me chat to show them instantly. */
    var scrollDownMessages = false;
    
    $(document).ready(function()
    {
    	$("#submitRoomCreation").click(function (event)
    	{
            var name = document.getElementById("nameInput").value;
            var partyName = document.getElementById("partyNameInput").value;
            var partyPassphrase = document.getElementById("passphraseInput").value;

            if(name == "" || partyName == "")
            {
                // reject data
                rejectHomeScreen();

                // focus to error
                if(name == "")
                {
                    document.getElementById("nameInput").focus();
                }
                else if(partyName == "")
                {
                    document.getElementById("partyNameInput").focus();
                }
            }
            else
            {
                socket.emit("createJoinPartyAndRegisterName", name, partyName, partyPassphrase);
            }
    	});

        $("#playScreenBack").click(function (event)
        {
            socket.emit("leaveParty");

            $("#partyMessages").empty();

            $("#homeScreen").animate({left: '0%'}, SCREEN_TRANSITION_SPEED);
            $("#playScreen").animate({left: '110%'}, SCREEN_TRANSITION_SPEED);
        });

        /**
         * In case of enter key pressed run the send button.
         */
        $("#inputMessage").keypress(function(event)
        {
            if(event.which == 13)
            {
                sendPartyMessage();
            }
        });

        $("#sendMsgBtn").click(function (event)
        {
            sendPartyMessage();
        });
        
        $("#infoBtn").click(function (event)
        {
            showHelpPopup();
        });
        
        $("#helpCloseBtn").click(function (event)
        {
           hideHelpPopup(); 
        });

        resizeMessagesLog();
        $( window ).bind("resize", function()
        {
            resizeMessagesLog();
        });
    });

    function sendPartyMessage()
    {
        var message = document.getElementById('inputMessage').value;

        if(message.length > 0)
        {
            socket.emit("partyMsg", message);

            document.getElementById('inputMessage').value = "";
        }
    }
    
    function showHelpPopup()
    {
        $("#popUpHelp").css({display: "block"});
        $("#overlay").css({display: "block"});
        
        var blurAmountStr = "blur(1px)";
        $("#container").css({filter: blurAmountStr, "-webkit-filter": blurAmountStr, "-moz-filter": blurAmountStr, "-o-filter": blurAmountStr, "-ms-filter": blurAmountStr});
        
        setTimeout(addContainerClickBind, 1000);
    }
    
    function addContainerClickBind()
    {
        $("#overlay").bind("click", hideHelpPopup)
    }
    
    function hideHelpPopup()
    {
        $("#popUpHelp").css({display: "none"});
        $("#overlay").css({display: "none"});
        
        $("#container").css({filter: '', "-webkit-filter": '', "-moz-filter": '', "-o-filter": '', "-ms-filter": ''});
        
        $("#overlay").unbind("click", hideHelpPopup);
    }

    /**
     * Resizes teh messages log to cover all free screen space.
     */
    function resizeMessagesLog()
    {
        var offsetHeight = document.getElementById('playScreenBack').offsetHeight;
        var endHeight = document.getElementById('inputMessage').getBoundingClientRect().top;
        $("#partyMessages").css({top: offsetHeight});
        $("#partyMessages").height(endHeight - offsetHeight);
    }
    
    /**
     * Checks if messages scroll is already scrolled down so it returns true to scroll to show the new messages.
     * @returns True to scroll on new message. False if not.
     */
    function checkToScrollOnNewMessage()
    {
        if(partyMsgsElem.scrollTop + partyMsgsElem.clientHeight == partyMsgsElem.scrollHeight)
        {
            return true;
        }
        return false;
    }
    
    /**
     * Scrolls message log to the last message.
     */
    function scrollDownMessageLog()
    {
        if(scrollDownMessages)
        {
            partyMsgsElem.scrollTop = partyMsgsElem.scrollHeight;
        }
        
        scrollDownMessages = false;
    }

    function rejectHomeScreen()
    {
        $("#homeScreen").animate({left: '-5px'}, 50).animate({left: '5px'}, 50).animate({left: '-5px'}, 50).animate({left: '5px'}, 50).animate({left: '-5px'}, 50).animate({left: '5px'}, 50).animate({left: '0%'}, 50);
    }
 
    // SOCKET.IO functions

    socket.on('connect', function()
    {
        $("#submitRoomCreation").removeAttr('disabled');
        document.getElementById("homeScreenWarnings").innerHTML = "";
    });

    socket.on('disconnect', function()
    {
        $("#submitRoomCreation").attr('disabled', true);
        
        $("#partyMessages").empty();
        
        $("#homeScreen").animate({left: '0%'}, SCREEN_TRANSITION_SPEED);
        $("#playScreen").animate({left: '110%'}, SCREEN_TRANSITION_SPEED);

        document.getElementById("homeScreenWarnings").innerHTML = "Disconnected from server";
    });

    socket.on('error', function(data)
    {
        $("#submitRoomCreation").attr('disabled', true);
        console.log("Connection error: " + data);
    });

    socket.on('rejectedLogIn', function()
    {
        document.getElementById("homeScreenWarnings").innerHTML = "Party name already taken or wrong passphrase";
        rejectHomeScreen();
    });

    socket.on('partyCreated', function(partyName, partyMembers)
    {
        $("#homeScreen").animate({left: '-110%'}, SCREEN_TRANSITION_SPEED);
        $("#playScreen").animate({left: '0%'}, SCREEN_TRANSITION_SPEED);

        document.getElementById("homeScreenWarnings").innerHTML = "";
    });

    socket.on('partyLoggedIn', function(partyName, partyMembers)
    {
        $("#homeScreen").animate({left: '-110%'}, SCREEN_TRANSITION_SPEED);
        $("#playScreen").animate({left: '0%'}, SCREEN_TRANSITION_SPEED);

        document.getElementById("homeScreenWarnings").innerHTML = "";
        
        scrollDownMessageLog();
    });

    socket.on('partyMsg', function(who, msg)
    {
        scrollDownMessages = checkToScrollOnNewMessage();
        
        $("#partyMessages").append("<strong>" + who + ":</strong> " + msg + "<br>");
        
        scrollDownMessageLog();
    });
    
    socket.on('systemPartyMsg', function(msg)
    {
        scrollDownMessages = checkToScrollOnNewMessage();
        
        $("#partyMessages").append("<strong>" + who + ":</strong> " + msg + "<br>");
        
        scrollDownMessageLog();
    });
    
    socket.on('partyMemberLeft', function(who)
    {
        scrollDownMessages = checkToScrollOnNewMessage();
        
        $("#partyMessages").append("<strong>" + who + "</strong> left<br>");
        
        scrollDownMessageLog();
    });
    
    socket.on('partyMemberJoined', function(who)
    {
        scrollDownMessages = checkToScrollOnNewMessage();
        
        $("#partyMessages").append("<strong>" + who + "</strong> joined in<br>");
        
        scrollDownMessageLog();
    });
    
    socket.on('rolls', function(who, rolls)
    {
        var rollsStr;
        var sum;
        var rollObj;
        for(var rollsIndex = 0;rollsIndex < rolls.length;rollsIndex++)
        {
            rollObj = rolls[rollsIndex];
            sum = 0;
            rollsStr = "<span class=\"systemMessageFont\">" + who + " rolled " + rollObj.rolls[0];
            sum += rollObj.rolls[0];
            
            for(var sameRollsIndex = 1;sameRollsIndex < rollObj.rolls.length;sameRollsIndex++)
            {
                if(rollObj.rolls[sameRollsIndex] < 0)
                    rollsStr = rollsStr.concat(rollObj.rolls[sameRollsIndex]);
                else
                    rollsStr = rollsStr.concat("+" + rollObj.rolls[sameRollsIndex]);
                sum += rollObj.rolls[sameRollsIndex];
            }
            
            if(rollObj.modifier != 0)
            {
                if(rollObj.modifier > 0)
                    rollsStr = rollsStr.concat("+" + rollObj.modifier);
                else
                    rollsStr = rollsStr.concat(rollObj.modifier);
                    
                sum += rollObj.modifier;
            }
            
            if(rollObj.rolls.length > 1 || rollObj.modifier != 0)
            {
                rollsStr = rollsStr.concat(" for a sum of " + sum + "</span><br>");
            }
            else
            {
                rollsStr = rollsStr.concat("</span><br>");
            }
            
            scrollDownMessages = checkToScrollOnNewMessage();
            
            $("#partyMessages").append(rollsStr);
            
            scrollDownMessageLog();
        }
    });
    </script>
</body>
</html>
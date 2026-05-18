
//maps difficulty name to gameplay values
const DIFFICULTY_CONFIG = {
    easy:   { fallSpeed: 2.0, spawnInterval: 2200, batWidth: 180, pointsBase: 10, label: "Easy"   },
    medium: { fallSpeed: 3.5, spawnInterval: 1400, batWidth: 140, pointsBase: 15, label: "Medium" },
    hard:   { fallSpeed: 5.5, spawnInterval: 900,  batWidth: 100, pointsBase: 20, label: "Hard"   }
};

//Array of all possible falling object types
const OBJECT_TYPES = [
    { type: "apple",  colour: "rgb(251, 255, 0)", points: 1, defaultRadius: 18, isBonus: false },
    { type: "orange", colour: "#f39c12", points: 1, defaultRadius: 18, isBonus: false },
    { type: "drop",   colour: "#ff0000", points: 1, defaultRadius: 16, isBonus: false },
    { type: "star",   colour: "#ff009d", points: 3, defaultRadius: 22, isBonus: true  }
];

const BAT_COLOUR_MAP = {
    blue:  "#2563eb",
    green: "#16a34a",
    red:   "#dc2626"
};

const STARTING_LIVES = 3;



/**
 * GameState – constructor that holds all runtime state for one game session.
 * @param {Object} settings  – settings loaded from sessionStorage
 */
function GameState(settings) {
    // Player info
    this.playerName  = settings.playerName  || "Player";
    this.difficulty  = settings.difficulty  || "medium";
    this.batColour   = settings.batColour   || "blue";
    this.doubleScore = settings.doubleScore || false;
    this.showShadow  = settings.showShadow  || false;
    this.randomSizes = settings.randomSizes || false;

    //Score counters
    this.score  = 0;
    this.caught = 0;
    this.missed = 0;
    this.lives  = STARTING_LIVES;

    //Change 3: Code added – combo streak counter
    this.streak = 0;   // consecutive catches since last miss
    //End Change 3

    //Status flags
    this.running  = false;
    this.paused   = false;
    this.gameOver = false;

    //Methods

    //Calculate points awarded for a single catch
    this.computePoints = function (basePoints) {
        const config     = DIFFICULTY_CONFIG[this.difficulty] || DIFFICULTY_CONFIG.medium;
        const multiplier = this.doubleScore ? 2 : 1;

        //Change 3: Code added – apply streak multiplier on top of other multipliers
        const streakBonus = this.streak >= 5 ? 3 :
                            this.streak >= 3 ? 2 : 1;
        return Math.round(basePoints * (config.pointsBase / 10) * multiplier * streakBonus);
        //End Change 3
    };

    //Return a formatted one-line status string
    this.getStatus = function () {
        const diff = DIFFICULTY_CONFIG[this.difficulty]
                     ? DIFFICULTY_CONFIG[this.difficulty].label
                     : capitalise(this.difficulty);
        return this.playerName + " | Score: " + this.score +
               " | Lives: " + this.lives + " | " + diff;
    };

    //Serialise to a plain object for storage
    this.toStorable = function () {
        return {
            playerName:  this.playerName,
            difficulty:  this.difficulty,
            batColour:   this.batColour,
            doubleScore: this.doubleScore,
            showShadow:  this.showShadow,
            randomSizes: this.randomSizes,
            score:       this.score,
            caught:      this.caught,
            missed:      this.missed,
            lives:       this.lives,
            streak:      this.streak,
            running:     this.running,
            paused:      this.paused,
            gameOver:    this.gameOver
        };
    };
}

//ARRAYS


//Array of currently active falling objects on the canvas
let fallingObjects = [];

//Event log array – history of game events this session
const gameEventLog = [];

//Score history array – tracks scores per game in this session
const sessionScores = [];


let state        = null;
let gameLoopId   = null;
let spawnTimerId = null;

let batX     = 0;
let batSpeed = 8;

const keysHeld = {
    ArrowLeft:  false,
    ArrowRight: false
};

//DOM REFERENCES


const gameArea       = document.getElementById("gameArea");
const bat            = document.getElementById("bat");
const messageArea    = document.getElementById("messageArea");
const logArea        = document.getElementById("logArea");

const displayPlayer     = document.getElementById("displayPlayer");
const displayScore      = document.getElementById("displayScore");
const displayCaught     = document.getElementById("displayCaught");
const displayMissed     = document.getElementById("displayMissed");
const displayLives      = document.getElementById("displayLives");
const displayDifficulty = document.getElementById("displayDifficulty");

//Change 3: Code added – streak display element
const displayStreak = document.getElementById("displayStreak");
//End Change 3


//Capitalise first letter
function capitalise(str) {
    if (!str || str.length === 0) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, lo, hi) {
    return Math.min(Math.max(value, lo), hi);
}

//Format timestamp
function timestamp() {
    const now = new Date();
    const hh  = String(now.getHours()).padStart(2, "0");
    const mm  = String(now.getMinutes()).padStart(2, "0");
    const ss  = String(now.getSeconds()).padStart(2, "0");
    return "[" + hh + ":" + mm + ":" + ss + "]";
}


//Change 1
/* Old cookie functions – unreliable on file:// and strict privacy browsers,
   causing scores and player names to silently fail to persist.

function setCookie(name, value, days) {
    const expiry = new Date();
    expiry.setTime(expiry.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + "=" + encodeURIComponent(value) +
                      ";expires=" + expiry.toUTCString() + ";path=/";
    console.log("[Cookie SET] " + name + " = " + value);
}

function getCookie(name) {
    const prefix  = name + "=";
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
        const c = cookies[i].trim();
        if (c.indexOf(prefix) === 0) {
            return decodeURIComponent(c.substring(prefix.length));
        }
    }
    return null;
}
*/

//Replaced with: Reliable cookie helpers with localStorage fallback.
//The best score is now guaranteed to persist across sessions regardless of
//browser cookie policy or file:// protocol restrictions.

function setCookie(name, value, days) {
    const expiry = new Date();
    expiry.setTime(expiry.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + "=" + encodeURIComponent(value) +
                      ";expires=" + expiry.toUTCString() + ";path=/";

    //Mirror to localStorage as a reliable fallback
    try {
        localStorage.setItem("cookie_" + name, JSON.stringify({
            value:   encodeURIComponent(value),
            expires: expiry.getTime()
        }));
    } catch (e) { /* localStorage unavailable – cookie only */ }

    console.log("[Cookie SET] " + name + " = " + value);
}

function getCookie(name) {
    //Try the real cookie jar first
    const prefix  = name + "=";
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
        const c = cookies[i].trim();
        if (c.indexOf(prefix) === 0) {
            return decodeURIComponent(c.substring(prefix.length));
        }
    }

    //Fall back to localStorage mirror
    try {
        const stored = localStorage.getItem("cookie_" + name);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.expires > Date.now()) {
                return decodeURIComponent(parsed.value);
            }
            localStorage.removeItem("cookie_" + name); //expired – clean up
        }
    } catch (e) { /* ignore */ }

    return null;
}
//End Change 1


function saveToSession(key, value) {
    sessionStorage.setItem(key, JSON.stringify(value));
}

// Load a value from sessionStorage; returns null if absent
function loadFromSession(key) {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
}


// Refresh every stats display element from the current state
function updateDisplay() {
    if (!state) return;
    displayPlayer.textContent     = state.playerName;
    displayScore.textContent      = state.score;
    displayCaught.textContent     = state.caught;
    displayMissed.textContent     = state.missed;
    displayLives.textContent      = state.lives;
    displayDifficulty.textContent = capitalise(state.difficulty);

    //Change 3: Code added – update streak display
    if (displayStreak) {
        if (state.streak >= 5) {
            displayStreak.textContent = state.streak + " 🔥🔥";
        } else if (state.streak >= 3) {
            displayStreak.textContent = state.streak + " 🔥";
        } else {
            displayStreak.textContent = state.streak;
        }
    }
    //End Change 3
}

//write a message
function showMessage(msg) {
    messageArea.textContent = msg;
    console.log("[MSG] " + msg);
}

// Append a timestamped entry to the game log area and the array
function addLog(entry) {
    const line = timestamp() + " " + entry;
    gameEventLog.push(line);

    if (gameEventLog.length > 100) gameEventLog.shift();

    const div = document.createElement("div");
    div.className   = "log-entry";
    div.textContent = line;
    logArea.prepend(div);

    console.log("[LOG] " + line);
}


function initialiseBat(settings) {
    const config = DIFFICULTY_CONFIG[settings.difficulty] || DIFFICULTY_CONFIG.medium;

    bat.style.width           = config.batWidth + "px";
    bat.style.backgroundColor = BAT_COLOUR_MAP[settings.batColour] || "#2563eb";

    //Shadow option
    if (settings.showShadow) {
        bat.classList.add("shadow");
    } else {
        bat.classList.remove("shadow");
    }

    //Centre the bat horizontally
    const areaWidth = gameArea.offsetWidth;
    batX = Math.floor((areaWidth - config.batWidth) / 2);
    bat.style.left = batX + "px";
}

//FALLING OBJECTS

// Spawn one new falling object at a random X position
function spawnObject() {
    if (!state || !state.running || state.paused || state.gameOver) return;

    const config    = DIFFICULTY_CONFIG[state.difficulty] || DIFFICULTY_CONFIG.medium;
    const areaWidth = gameArea.offsetWidth;

    //Choose object type
    let chosenType;
    if (Math.random() < 0.15) {
        //Pick the star (bonus)
        chosenType = OBJECT_TYPES.find(function (t) { return t.isBonus; });
    } else {
        //Pick a random non-bonus type
        const nonBonus = OBJECT_TYPES.filter(function (t) { return !t.isBonus; });
        chosenType = nonBonus[randomInt(0, nonBonus.length - 1)];
    }

    //Determine radius – use random sizes if that option is enabled
    const radius = state.randomSizes
        ? randomInt(10, 26)
        : chosenType.defaultRadius;

    const size   = radius * 2;

    //Random horizontal start within the game area
    const startX = randomInt(0, Math.max(0, areaWidth - size));

    const speed = config.fallSpeed + Math.random() * 1.5;

    //Create the DOM element
    const el = document.createElement("div");
    el.className            = "falling-object";
    el.style.width          = size + "px";
    el.style.height         = size + "px";
    el.style.left           = startX + "px";
    el.style.top            = "0px";
    el.style.backgroundColor = chosenType.colour;

    //Extra styling for bonus objects so they stand out
    if (chosenType.isBonus) {
        el.style.border     = "3px solid #b45309";
        el.style.boxShadow  = "0 0 8px 2px rgba(251,191,36,0.7)";
    }

    gameArea.appendChild(el);

    fallingObjects.push({
        el:      el,
        x:       startX,
        y:       0,
        size:    size,
        speed:   speed,
        points:  chosenType.points,
        type:    chosenType.type,
        isBonus: chosenType.isBonus
    });
}

//Remove a falling object at the given index
function removeFallingObject(index) {
    const obj = fallingObjects[index];
    if (obj && obj.el && obj.el.parentNode) {
        obj.el.parentNode.removeChild(obj.el);
    }
    fallingObjects.splice(index, 1);
}

//Remove every remaining falling object from the screen
function clearAllObjects() {
    while (fallingObjects.length > 0) {
        removeFallingObject(0);
    }
}

//COLLISION DETECTION

// Return true if a falling object overlaps with the bat
function isColliding(obj) {
    const config    = DIFFICULTY_CONFIG[state.difficulty] || DIFFICULTY_CONFIG.medium;
    const areaH     = gameArea.offsetHeight;

    const batTop    = areaH - 40;
    const batBottom = areaH - 20;
    const batLeft   = batX;
    const batRight  = batX + config.batWidth;

    const objTop    = obj.y;
    const objBottom = obj.y + obj.size;
    const objLeft   = obj.x;
    const objRight  = obj.x + obj.size;

    return (
        objBottom >= batTop   &&
        objTop    <= batBottom &&
        objRight  >= batLeft  &&
        objLeft   <= batRight
    );
}

//SAVE / LOAD

// Persist the current game state to sessionStorage
function persistGameState() {
    if (!state) return;
    const storable  = state.toStorable();
    storable.batX   = batX;
    saveToSession("skyCatcherGameState", storable);
}

//GAME LOOP

function gameLoop() {
    if (!state || !state.running || state.paused || state.gameOver) return;

    const config    = DIFFICULTY_CONFIG[state.difficulty] || DIFFICULTY_CONFIG.medium;
    const areaWidth = gameArea.offsetWidth;
    const areaH     = gameArea.offsetHeight;
    const groundY   = areaH - 12;   // top of the ground element

    if (keysHeld.ArrowLeft) {
        batX = clamp(batX - batSpeed, 0, areaWidth - config.batWidth);
        bat.style.left = batX + "px";
    }
    if (keysHeld.ArrowRight) {
        batX = clamp(batX + batSpeed, 0, areaWidth - config.batWidth);
        bat.style.left = batX + "px";
    }

    for (let i = fallingObjects.length - 1; i >= 0; i--) {
        const obj = fallingObjects[i];
        obj.y += obj.speed;
        obj.el.style.top = obj.y + "px";

        if (isColliding(obj)) {
            //Change 3: Code added – increment streak before computing points
            state.streak += 1;
            //End Change 3

            const pts = state.computePoints(obj.points);
            state.score  += pts;
            state.caught += 1;

            if (obj.isBonus) {
                showMessage("⭐ Bonus " + obj.type + " caught! +" + pts + " pts  |  Score: " + state.score);
                addLog("BONUS caught (" + obj.type + ") +" + pts + " pts");
            } else {
                //Change 3: Code added – include streak info in catch message
                const streakMsg = state.streak >= 3
                    ? "  🔥 Streak x" + state.streak + "!"
                    : "";
                showMessage("Caught! +" + pts + " pts  |  Score: " + state.score + "  |  Lives: " + state.lives + streakMsg);
                //End Change 3
                addLog("Caught (" + obj.type + ") +" + pts + " pts  |  Total: " + state.score);
            }

            //Change 3: Code added – flash the bat to give visual catch feedback
            bat.classList.add("caught-flash");
            setTimeout(function () { bat.classList.remove("caught-flash"); }, 200);
            //End Change 3

            removeFallingObject(i);
            updateDisplay();

        } else if (obj.y + obj.size >= groundY) {
            state.missed += 1;
            state.lives  -= 1;

            //Change 3: Code added – reset streak on miss
            state.streak = 0;
            //End Change 3

            showMessage("Missed! Lives left: " + state.lives + "  |  Score: " + state.score);
            addLog("Missed object. Lives: " + state.lives);

            removeFallingObject(i);
            updateDisplay();

            // Check for game over
            if (state.lives <= 0) {
                endGame();
                return;   // Stop the loop immediately
            }
        }
    }

    // Persist state to session storage every frame (cheap JSON write)
    persistGameState();

    // Schedule next frame
    gameLoopId = requestAnimationFrame(gameLoop);
}


// Start (or restart) the game
function startGame() {
    // If a game is already in progress, ask before restarting
    if (state && state.running) {
        const ok = confirm("A game is already running.\nStart a fresh game and lose current progress?");
        if (!ok) return;
        stopLoops();
        clearAllObjects();
    }

    // Load settings that the launcher saved to sessionStorage
    const settings = loadSettingsFromSession();
    state = new GameState(settings);

    initialiseBat(settings);
    updateDisplay();

    showMessage("Game started!\nUse the LEFT and RIGHT arrow keys to move the bat.\nCatch as many objects as you can!");
    addLog("=== NEW GAME === Player: " + state.playerName + " | Difficulty: " + capitalise(state.difficulty));

    // Check for a previous best score
    const prevBest = getCookie("skyCatcherBestScore");
    if (prevBest) {
        addLog("Previous best score to beat: " + prevBest);
    }

    state.running = true;

    // Start the object spawner
    const config = DIFFICULTY_CONFIG[state.difficulty] || DIFFICULTY_CONFIG.medium;
    spawnTimerId = setInterval(spawnObject, config.spawnInterval);

    // Start the animation loop
    gameLoopId = requestAnimationFrame(gameLoop);
}

// End the game (called when lives reach zero)
function endGame() {
    state.running  = false;
    state.gameOver = true;

    stopLoops();
    clearAllObjects();

    // Track this game's score in the session scores array
    sessionScores.push(state.score);

    // Update best score cookie if this run is the best so far
    const prevBest = parseInt(getCookie("skyCatcherBestScore") || "0", 10);
    if (state.score > prevBest) {
        setCookie("skyCatcherBestScore", String(state.score), 30);
        addLog("*** NEW BEST SCORE: " + state.score + " ***");
    }

    // Compute average score for this session using Math
    const total   = sessionScores.reduce(function (acc, s) { return acc + s; }, 0);
    const average = Math.round(total / sessionScores.length);

    updateDisplay();

    const summary =
        "Game Over!\n" +
        "Player: " + state.playerName + "\n" +
        "Final Score: " + state.score + "\n" +
        "Caught: " + state.caught + " | Missed: " + state.missed + "\n" +
        "Session Average: " + average;

    showMessage(summary);
    addLog("=== GAME OVER === Score: " + state.score + " | Caught: " + state.caught + " | Missed: " + state.missed);

    // Alert with the game-over summary
    alert(summary);
}

// Pause or resume the game
function togglePause() {
    if (!state || !state.running) {
        showMessage("No game is currently running.\nClick Start Game to begin.");
        return;
    }

    if (state.paused) {
        // Resume
        state.paused = false;
        showMessage("Game resumed! Keep going, " + state.playerName + "!");
        addLog("Game resumed.");

        // Restart
        const config = DIFFICULTY_CONFIG[state.difficulty] || DIFFICULTY_CONFIG.medium;
        spawnTimerId = setInterval(spawnObject, config.spawnInterval);
        gameLoopId   = requestAnimationFrame(gameLoop);
    } else {
        // Pause
        state.paused = true;
        stopLoops();
        showMessage("Game paused.\nClick Pause / Resume to continue.");
        addLog("Game paused.");
    }
}

// Manually save the session to sessionStorage
function saveSession() {
    if (!state) {
        alert("No game is in progress to save.");
        return;
    }
    persistGameState();
    addLog("Session saved manually.");
    alert("Session saved!\nYour score (" + state.score + ") and game state have been stored.");
    console.log("[Session] Manually saved: " + JSON.stringify(state.toStorable()));
}

// Load a previously saved session from sessionStorage
function loadSession() {
    const saved = loadFromSession("skyCatcherGameState");

    if (!saved) {
        alert("No saved session was found.\nPlay a game first and then save it.");
        return;
    }

    // Confirm if a game is currently running
    if (state && state.running) {
        const ok = confirm("Loading a session will replace the current game.\nContinue?");
        if (!ok) return;
    }

    // Stop any running loops and clear the board
    stopLoops();
    clearAllObjects();

    // Recreate the settings object for initialiseBat
    const settings = {
        playerName:  saved.playerName  || "Player",
        difficulty:  saved.difficulty  || "medium",
        batColour:   saved.batColour   || "blue",
        doubleScore: saved.doubleScore || false,
        showShadow:  saved.showShadow  || false,
        randomSizes: saved.randomSizes || false
    };

    state = new GameState(settings);

    // Restore counters from the saved record
    state.score    = saved.score    || 0;
    state.caught   = saved.caught   || 0;
    state.missed   = saved.missed   || 0;
    state.lives    = saved.lives    || STARTING_LIVES;
    state.streak   = saved.streak   || 0;
    state.running  = false;
    state.paused   = false;
    state.gameOver = false;

    batX = saved.batX || 0;
    initialiseBat(settings);
    bat.style.left = batX + "px";

    updateDisplay();
    showMessage("Session loaded!\nScore: " + state.score + " | Lives: " + state.lives + "\nClick Start Game to continue.");
    addLog("Session loaded. Score: " + state.score + " | Lives: " + state.lives);

    alert("Session loaded successfully!\nScore: " + state.score + " | Lives: " + state.lives);
}

// Reset the game – clears score, objects and counters
function resetGame() {
    const ok = confirm("Reset the game?\nAll current progress will be lost.");
    if (!ok) return;

    stopLoops();
    clearAllObjects();

    if (state) {
        state.score    = 0;
        state.caught   = 0;
        state.missed   = 0;
        state.lives    = STARTING_LIVES;
        state.streak   = 0;
        state.running  = false;
        state.paused   = false;
        state.gameOver = false;
    }

    // Re-initialise the bat using the last-known settings
    const settings = loadSettingsFromSession();
    if (settings) initialiseBat(settings);

    updateDisplay();
    showMessage("Game reset.\nClick Start Game whenever you are ready.");
    addLog("=== GAME RESET ===");
    console.log("[Game] Reset completed.");
}

// Close the game window and return to the launcher
function backToSettings() {
    if (state && state.running) {
        const ok = confirm("Going back will end the current game.\nAre you sure?");
        if (!ok) return;
        stopLoops();
    }
    window.close();
}


function stopLoops() {
    if (gameLoopId)   cancelAnimationFrame(gameLoopId);
    if (spawnTimerId) clearInterval(spawnTimerId);
    gameLoopId   = null;
    spawnTimerId = null;
}


// Load game settings from sessionStorage; falls back to sensible defaults
function loadSettingsFromSession() {
    const settings = loadFromSession("skyCatcherSettings");
    if (settings) {
        console.log("[Game] Settings loaded: " + JSON.stringify(settings));
        return settings;
    }
    console.warn("[Game] No session settings found – using defaults.");
    return {
        playerName:  "Player",
        difficulty:  "medium",
        batColour:   "blue",
        doubleScore: false,
        showShadow:  true,
        randomSizes: false
    };
}


document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft"  && keysHeld.hasOwnProperty("ArrowLeft"))  {
        keysHeld.ArrowLeft = true;
        e.preventDefault();   // Prevent the page from scrolling
    }
    if (e.key === "ArrowRight" && keysHeld.hasOwnProperty("ArrowRight")) {
        keysHeld.ArrowRight = true;
        e.preventDefault();
    }
});

// Mark a key as released
document.addEventListener("keyup", function (e) {
    if (e.key === "ArrowLeft")  keysHeld.ArrowLeft  = false;
    if (e.key === "ArrowRight") keysHeld.ArrowRight = false;
});


//Change 2
/* Previously the bat could only be moved using keyboard arrow keys.
   Players using a mouse or touchscreen had no way to control the game,
   making it inaccessible on laptops (trackpad) and mobile devices.
*/

//Replaced with: Mouse and touch controls added to the game area.
//Moving the mouse over the game area centres the bat on the cursor.
//On touchscreens, dragging a finger does the same thing.

gameArea.addEventListener("mousemove", function (e) {
    if (!state || !state.running || state.paused || state.gameOver) return;

    const config = DIFFICULTY_CONFIG[state.difficulty] || DIFFICULTY_CONFIG.medium;
    const rect   = gameArea.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    //Centre the bat under the cursor
    batX = clamp(
        Math.round(mouseX - config.batWidth / 2),
        0,
        gameArea.offsetWidth - config.batWidth
    );
    bat.style.left = batX + "px";
});

gameArea.addEventListener("touchmove", function (e) {
    if (!state || !state.running || state.paused || state.gameOver) return;
    e.preventDefault();   //Prevent page scroll while playing on mobile

    const config  = DIFFICULTY_CONFIG[state.difficulty] || DIFFICULTY_CONFIG.medium;
    const rect    = gameArea.getBoundingClientRect();
    const touchX  = e.touches[0].clientX - rect.left;

    batX = clamp(
        Math.round(touchX - config.batWidth / 2),
        0,
        gameArea.offsetWidth - config.batWidth
    );
    bat.style.left = batX + "px";
}, { passive: false });
//End Change 2


//event listeners

document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("pauseBtn").addEventListener("click", togglePause);
document.getElementById("saveBtn").addEventListener("click",  saveSession);
document.getElementById("loadBtn").addEventListener("click",  loadSession);
document.getElementById("resetBtn").addEventListener("click", resetGame);
document.getElementById("backBtn").addEventListener("click",  backToSettings);



(function init() {
    const settings = loadSettingsFromSession();

    // Show player name and difficulty even before the game starts
    displayPlayer.textContent     = settings.playerName || "-";
    displayDifficulty.textContent = capitalise(settings.difficulty) || "-";
    displayLives.textContent      = STARTING_LIVES;
    displayScore.textContent      = "0";
    displayCaught.textContent     = "0";
    displayMissed.textContent     = "0";

    //Change 3: Code added – initialise streak display
    if (displayStreak) displayStreak.textContent = "0";
    //End Change 3

    initialiseBat(settings);

    // Show a personalised welcome message
    const name    = settings.playerName ? capitalise(settings.playerName) : "Player";
    const best    = getCookie("skyCatcherBestScore");
    const bestMsg = best ? "\nYour best score so far: " + best : "";

    //Change 2: Code added – include control hint for mouse users
    showMessage("Welcome, " + name + "!\nClick Start Game when you are ready.\nControls: Arrow keys OR move your mouse over the game area." + bestMsg);
    //End Change 2

    if (best) {
        addLog("Welcome back, " + name + ". Best score to beat: " + best);
    } else {
        addLog("Welcome, " + name + ". No best score yet – go for it!");
    }

    console.log("[Game] game.js initialised for player: " + name);
})();

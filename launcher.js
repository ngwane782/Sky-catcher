
// ── Difficulty settings object (used for preview info)
const DIFFICULTY_INFO = {
    easy:   { label: "Easy",   desc: "Wide bat, slow speed, slow spawning" },
    medium: { label: "Medium", desc: "Medium bat, medium speed" },
    hard:   { label: "Hard",   desc: "Narrow bat, fast speed, fast spawning" }
};

//Score history array – loaded from cookie on startup
const scoreHistory = [];

//Player object constructor
function Player(name, bestScore) {
    this.name      = name;
    this.bestScore = bestScore || 0;

    // Method: return a greeting string using String methods
    this.getGreeting = function () {
        const trimmed = this.name.trim();
        if (trimmed.length === 0) return "Hello, stranger!";
        return "Welcome back, " + capitalise(trimmed) + "!";
    };

    // Method: check whether a new score beats the best
    this.updateBest = function (newScore) {
        if (newScore > this.bestScore) {
            this.bestScore = newScore;
            return true;
        }
        return false;
    };
}

//Settings object
const gameSettings = {
    playerName:  "",
    difficulty:  "medium",
    batColour:   "blue",
    doubleScore: false,
    showShadow:  true,
    randomSizes: false,

    // Building a human readable summary using String array joining
    getSummary: function () {
        const name    = this.playerName.trim() || "Unknown Player";
        const diff    = DIFFICULTY_INFO[this.difficulty]
                        ? DIFFICULTY_INFO[this.difficulty].label
                        : capitalise(this.difficulty);
        const extras  = [];
        if (this.doubleScore) extras.push("Double Score");
        if (this.showShadow)  extras.push("Bat Shadow");
        if (this.randomSizes) extras.push("Random Sizes");
        const extrasText = extras.length > 0 ? extras.join(", ") : "None";

        return "Player: " + name +
               " | Difficulty: " + diff +
               " | Bat: " + capitalise(this.batColour) +
               " | Extras: " + extrasText;
    },

    //Validate required fields – returns true if valid
    isValid: function () {
        return this.playerName.trim().length >= 2;
    }
};

//DOM element references
const playerNameInput      = document.getElementById("playerName");
const difficultySelect     = document.getElementById("difficulty");
const doubleScoreCheckbox  = document.getElementById("doubleScore");
const showShadowCheckbox   = document.getElementById("showShadow");
const randomSizesCheckbox  = document.getElementById("randomSizes");
const previewText          = document.getElementById("previewText");


// Capitalise first letter of a string  (String method usage)
function capitalise(str) {
    if (!str || str.length === 0) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Trim and validate a name string  (String method usage)
function sanitiseName(raw) {
    return raw.replace(/[^a-zA-Z0-9 _-]/g, "").trim();
}

// Return a random integer between min and max (inclusive) – Math usage
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}


//Change 1
/* Old cookie functions – cookies were unreliable on file:// protocol and some
   browser privacy settings, causing the best score and player name to be lost.

function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + "=" + encodeURIComponent(value) +
                      ";expires=" + expires.toUTCString() + ";path=/";
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
//When the browser blocks cookies (e.g. file:// protocol, strict privacy mode),
//the value is transparently mirrored in localStorage so data is never lost.

function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + "=" + encodeURIComponent(value) +
                      ";expires=" + expires.toUTCString() + ";path=/";

    //Mirror to localStorage as a reliable fallback
    try {
        localStorage.setItem("cookie_" + name, JSON.stringify({
            value:   encodeURIComponent(value),
            expires: expires.getTime()
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


//SESSION STORAGE HELPERS


// Save any value to sessionStorage as JSON
function saveToSession(key, value) {
    sessionStorage.setItem(key, JSON.stringify(value));
    console.log("[Session SET] " + key);
}

// Load a value from sessionStorage; returns null if not found
function loadFromSession(key) {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
}

// ────────────────────────────────────────────────────────────
//  FORM READING HELPERS
// ────────────────────────────────────────────────────────────

// Return the value of the currently selected radio in a group
function getSelectedRadio(groupName) {
    const radios = document.querySelectorAll("input[name=\"" + groupName + "\"]");
    for (let i = 0; i < radios.length; i++) {
        if (radios[i].checked) return radios[i].value;
    }
    return "";
}

// Read all form fields into the gameSettings object
function readForm() {
    gameSettings.playerName  = playerNameInput.value;
    gameSettings.difficulty  = difficultySelect.value;
    gameSettings.batColour   = getSelectedRadio("batColour");
    gameSettings.doubleScore = doubleScoreCheckbox.checked;
    gameSettings.showShadow  = showShadowCheckbox.checked;
    gameSettings.randomSizes = randomSizesCheckbox.checked;
}

// ────────────────────────────────────────────────────────────
//  LIVE PREVIEW
// ────────────────────────────────────────────────────────────

// Update the live preview section whenever any form input changes
function updatePreview() {
    readForm();

    // Build preview using Math.abs to show a "tip" score hint
    const tipScore = Math.abs(randomInt(50, 200));
    const diffInfo = DIFFICULTY_INFO[gameSettings.difficulty];
    const tip      = diffInfo ? " (" + diffInfo.desc + ")" : "";

    previewText.textContent = gameSettings.getSummary() +
                              "\nTip – aim for over " + tipScore + " points!";

    // Best score from cookie – display if available
    const best = getCookie("skyCatcherBestScore");
    if (best) {
        previewText.textContent += "\nYour best score: " + best;
    }

    console.log("[Preview] " + gameSettings.getSummary());
}

// ────────────────────────────────────────────────────────────
//  FORM VALIDATION
// ────────────────────────────────────────────────────────────

// Validate the form before the game is opened; uses prompt() when name is empty
function validateAndGetName() {
    let name = playerNameInput.value.trim();

    // If name is blank, use prompt() to ask for it
    if (name.length === 0) {
        const entered = prompt("Please enter your player name to continue:");
        if (entered !== null && entered.trim().length > 0) {
            name = sanitiseName(entered);
            playerNameInput.value = name;
            gameSettings.playerName = name;
        } else {
            alert("A player name is required to start the game. Please enter your name.");
            return false;
        }
    }

    // String validation: minimum 2 characters
    if (name.length < 2) {
        alert("Player name must be at least 2 characters long.");
        return false;
    }

    // String validation: maximum 20 characters (already enforced by maxlength but double-check)
    if (name.length > 20) {
        alert("Player name must not exceed 20 characters.");
        return false;
    }

    return true;
}

// ────────────────────────────────────────────────────────────
//  MAIN ACTIONS
// ────────────────────────────────────────────────────────────

// Open the game in a new window, passing settings via sessionStorage
function openGameWindow() {
    readForm();

    if (!validateAndGetName()) return;

    // Create a Player object for logging
    const best   = parseInt(getCookie("skyCatcherBestScore") || "0", 10);
    const player = new Player(gameSettings.playerName.trim(), best);
    console.log(player.getGreeting());

    // Package settings into session storage so game.js can read them
    const settingsToStore = {
        playerName:  gameSettings.playerName.trim(),
        difficulty:  gameSettings.difficulty,
        batColour:   gameSettings.batColour,
        doubleScore: gameSettings.doubleScore,
        showShadow:  gameSettings.showShadow,
        randomSizes: gameSettings.randomSizes
    };

    saveToSession("skyCatcherSettings", settingsToStore);

    // Also persist player name in a cookie (30-day expiry)
    setCookie("skyCatcherPlayer", gameSettings.playerName.trim(), 30);

    // Open the game window
    const gameWin = window.open(
        "game.html",
        "SkyCatcherGame",
        "width=1060,height=960,resizable=yes,scrollbars=yes"
    );

    if (!gameWin) {
        alert("The game window could not be opened.\nPlease allow pop-ups for this page and try again.");
    } else {
        console.log("[Launcher] Game window opened for player: " + gameSettings.playerName);
    }
}

// Save all current settings to cookies
function saveSettings() {
    readForm();

    setCookie("skyCatcherPlayer",      gameSettings.playerName.trim(), 30);
    setCookie("skyCatcherDifficulty",  gameSettings.difficulty,        30);
    setCookie("skyCatcherBatColour",   gameSettings.batColour,         30);
    setCookie("skyCatcherDoubleScore", String(gameSettings.doubleScore), 30);
    setCookie("skyCatcherShowShadow",  String(gameSettings.showShadow),  30);
    setCookie("skyCatcherRandomSizes", String(gameSettings.randomSizes), 30);

    // Add to score history array if available
    const best = getCookie("skyCatcherBestScore");
    if (best && scoreHistory.indexOf(parseInt(best, 10)) === -1) {
        scoreHistory.push(parseInt(best, 10));
    }

    updatePreview();
    alert("Settings saved successfully!");
    console.log("[Launcher] Settings saved. History length: " + scoreHistory.length);
}

// Load settings back from cookies into the form
function loadSettings() {
    const savedName        = getCookie("skyCatcherPlayer");
    const savedDifficulty  = getCookie("skyCatcherDifficulty");
    const savedBatColour   = getCookie("skyCatcherBatColour");
    const savedDoubleScore = getCookie("skyCatcherDoubleScore");
    const savedShowShadow  = getCookie("skyCatcherShowShadow");
    const savedRandomSizes = getCookie("skyCatcherRandomSizes");

    // Check that at least one setting was previously saved
    if (!savedName && !savedDifficulty && !savedBatColour) {
        alert("No saved settings were found. Save your settings first.");
        return;
    }

    // Restore each field if the cookie exists
    if (savedName)       playerNameInput.value = savedName;
    if (savedDifficulty) difficultySelect.value = savedDifficulty;

    if (savedBatColour) {
        const radios = document.querySelectorAll("input[name=\"batColour\"]");
        radios.forEach(function (r) {
            r.checked = (r.value === savedBatColour);
        });
    }

    if (savedDoubleScore !== null) doubleScoreCheckbox.checked = (savedDoubleScore === "true");
    if (savedShowShadow  !== null) showShadowCheckbox.checked  = (savedShowShadow  === "true");
    if (savedRandomSizes !== null) randomSizesCheckbox.checked = (savedRandomSizes === "true");

    updatePreview();
    alert("Settings loaded successfully!");
    console.log("[Launcher] Settings loaded from cookies.");
}

// Reset all form inputs to their defaults
function resetSettings() {
    // Use confirm() to verify the user's intent
    const confirmed = confirm("Reset all settings to their defaults?\nThis will not delete your saved best score.");
    if (!confirmed) return;

    playerNameInput.value  = "";
    difficultySelect.value = "medium";

    // Reset radio buttons – default is blue
    document.querySelectorAll("input[name=\"batColour\"]").forEach(function (r) {
        r.checked = (r.value === "blue");
    });

    doubleScoreCheckbox.checked = false;
    showShadowCheckbox.checked  = true;
    randomSizesCheckbox.checked = false;

    updatePreview();
    console.log("[Launcher] Settings reset to defaults.");
}


//EVENT LISTENERS

// Live preview updates on every change / input event
playerNameInput.addEventListener("input",  updatePreview);
difficultySelect.addEventListener("change", updatePreview);

document.querySelectorAll("input[name=\"batColour\"]").forEach(function (r) {
    r.addEventListener("change", updatePreview);
});

doubleScoreCheckbox.addEventListener("change", updatePreview);
showShadowCheckbox.addEventListener("change",  updatePreview);
randomSizesCheckbox.addEventListener("change", updatePreview);

// Button click events
document.getElementById("openGameBtn").addEventListener("click",    openGameWindow);
document.getElementById("saveSettingsBtn").addEventListener("click", saveSettings);
document.getElementById("loadSettingsBtn").addEventListener("click", loadSettings);
document.getElementById("resetSettingsBtn").addEventListener("click", resetSettings);

// Form submit event (prevents default browser submit)
document.getElementById("setupForm").addEventListener("submit", function (e) {
    e.preventDefault();
    openGameWindow();
});



(function init() {
    // Pre-fill player name from cookie if previously saved
    const savedName = getCookie("skyCatcherPlayer");
    if (savedName) {
        playerNameInput.value = savedName;
        gameSettings.playerName = savedName;
        console.log("[Launcher] Restored player name from cookie: " + savedName);
    }

    // Load best score from cookie into the score history array
    const savedBest = getCookie("skyCatcherBestScore");
    if (savedBest) {
        scoreHistory.push(parseInt(savedBest, 10));
        console.log("[Launcher] Best score on record: " + savedBest);
    }

    // Build the initial preview
    updatePreview();
    console.log("[Launcher] launcher.js initialised. Score history: [" + scoreHistory.join(", ") + "]");
})();

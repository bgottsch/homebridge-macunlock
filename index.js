var ssh = require('ssh-exec');
var Service, Characteristic;

module.exports = function(homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;

	homebridge.registerAccessory("homebridge-macunlock", "MacUnlock", MacUnlockAccessory);
}

function MacUnlockAccessory(log, config) {
	this.log = log;
	this.name = config["name"];
	this.ipAddress = config["ip-address"];
	this.username = config["username"];
	this.password = config["password"];
	
	var main = this;
	var targetState = Characteristic.LockTargetState.UNSECURED;
	
	this.lockservice = new Service.LockMechanism(this.name);
	
	this.lockservice
	.getCharacteristic(Characteristic.LockCurrentState)
	.on('get', function(callback) {
		var callbackInside = function(powerState) {
			
			main.log("PowerState: " + powerState);
			
			var callbackInsideInside = function(screenState) {
				
				main.log("ScreenState: " + screenState);
			
				if (powerState == 2 || screenState == 2){
					main.log("Unknown");
					callback(null, Characteristic.LockCurrentState.UNKNOWN);
				}else if (powerState == 1 || screenState == 1) {
					main.log("Secured");
					callback(null, Characteristic.LockCurrentState.SECURED);
				}else if (powerState == 0 || screenState == 0) {
					main.log("Unsecured");
					callback(null, Characteristic.LockCurrentState.UNSECURED);
				}else{
					main.log("Unknown");
					callback(null, Characteristic.LockCurrentState.UNKNOWN);
				}
			};
			
			main.getScreenSaverState(callbackInsideInside);
		};
	
		main.getPowerState(callbackInside);
	});
	
	this.lockservice
	.getCharacteristic(Characteristic.LockTargetState)
	.on('get', function(callback) {
		callback(null, main.targetState);
	})
	.on('set', function(value, callback) {
		if (value == Characteristic.LockTargetState.SECURED) {
			main.log("Locking...");
			main.setLockState("lock", callback);
		}else if (value == Characteristic.LockTargetState.UNSECURED) {
			main.log("Unlocking...");
			main.setLockState("unlock", callback);
		}else{
			main.log("Error changing the lock state.");
			callback(null);
		}
	});
}

MacUnlockAccessory.prototype.getPowerState = function(callback) {
	// ioreg -n IODisplayWrangler |grep -i IOPowerManagement
	// CurrentPowerState = 4 -> Unlocked | CurrentPowerState = 1 -> Locked
	// 0 -> unlocked | 1 -> locked | 2 -> unknown
	
	var main = this;
	
	var command = "ioreg -n IODisplayWrangler |grep -i IOPowerManagement";
	var parameters = {user: this.username, host: this.ipAddress, password: this.password};
	
	ssh(command, parameters, function (err, stdout, stderr) {
		if (stderr) {
			main.log('Power State Error: ' + stderr);
			callback(2);
		}else{
			if (stdout.indexOf("CurrentPowerState")) {
				var index = stdout.indexOf("CurrentPowerState") + "CurrentPowerState".length + 2
				var state = stdout.substr(index, 1);
			
				if (state == "4") {
					callback(0);
				}else if (state == "1") {
					callback(1);
				}else{
					callback(2);
				}
			}else{
				callback(2);
			}
		}
	});
}

MacUnlockAccessory.prototype.getScreenSaverState = function(callback) {
	// osascript -e 'tell application "System Events" to return running of screen saver preferences'
	// 0 -> unlocked | 1 -> locked | 2 -> unknown
	
	var main = this;
	
	var command = "osascript -e 'tell application \"System Events\" to return running of screen saver preferences'";
	var parameters = {user: this.username, host: this.ipAddress, password: this.password};
	
	ssh(command, parameters, function (err, stdout, stderr) {
  		if (stderr) {
			main.log('Screen Saver Error: ' + stderr);
			callback(2);
		}else{
			if (stdout.indexOf("true") == 0) {
				callback(1);
			}else if (stdout.indexOf("false") == 0) {
				callback(0);
			}else{
				callback(2);
			}
		}
	});
}

MacUnlockAccessory.prototype.setLockState = function(state, callback) {
	// Lock -> "/usr/local/bin/SleepDisplay" | Unlock -> "/usr/local/bin/SleepDisplay -w"
	// *you must have SleepDisplay installed on your Mac under location /usr/local/bin/
	// valid state values: "lock" | "unlock"
	
	var main = this;
	
	if (state == "lock") {
		var command = "/usr/local/bin/SleepDisplay";
		var parameters = {user: this.username, host: this.ipAddress, password: this.password};
		
		main.targetState = Characteristic.LockTargetState.SECURED;
		
		ssh(command, parameters, function (err, stdout, stderr) {
			if (stderr) {
				main.log('Lock Error: ' + stderr);
				callback(null);
			}else{
				callback(null);
			}
		});
		
	}else if (state == "unlock") {
		var command = "/usr/local/bin/SleepDisplay -w";
		var parameters = {user: this.username, host: this.ipAddress, password: this.password};
		
		main.targetState = Characteristic.LockTargetState.UNSECURED;
		
		ssh(command, parameters, function (err, stdout, stderr) {
			if (stderr) {
				main.log('Unlock Error: ' + stderr);
				callback(null);
			}else{
				setTimeout(function () {
					main.typePassword(callback);
				}, 3000);
			}
		});
	}
}

MacUnlockAccessory.prototype.typePassword = function(callback) {
	// osascript -e 'tell application "System Events" to keystroke $password'
	
	var main = this;
	
	var command = "osascript -e 'tell application \"System Events\" to keystroke \"" + this.password + "\"'";
	var parameters = {user: this.username, host: this.ipAddress, password: this.password};
	
	ssh(command, parameters, function (err, stdout, stderr) {
		if (stderr) {
			main.log('Password Error: ' + stderr);
			callback(null);
		}else{
			setTimeout(function () {
				main.typeReturn(callback);
			}, 500);
		}
	});
}

MacUnlockAccessory.prototype.typeReturn = function(callback) {
	// osascript -e 'tell application "System Events" to keystroke $password'
	
	var main = this;
	
	var command = "osascript -e 'tell application \"System Events\" to keystroke return'";
	var parameters = {user: this.username, host: this.ipAddress, password: this.password};
	
	ssh(command, parameters, function (err, stdout, stderr) {
		if (stderr) {
			main.log('Return Key Error: ' + stderr);
			callback(null);
		}else{
			callback(null);
		}
	});
}

MacUnlockAccessory.prototype.getServices = function() {
	return [this.lockservice];
}
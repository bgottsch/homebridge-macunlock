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
			
			var callbackInsideInside = function(screenState) {
				if (powerState == 2 || screenState == 2){
					callback(null, Characteristic.LockCurrentState.UNKNOWN);
				}else if (powerState == 1 || screenState == 1) {
					callback(null, Characteristic.LockCurrentState.SECURED);
				}else if (powerState == 0 || screenState == 0) {
					callback(null, Characteristic.LockCurrentState.UNSECURED);
				}else{
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
			main.setLockState("lock", callback);
		}else if (value == Characteristic.LockTargetState.UNSECURED) {
			main.setLockState("unlock", callback);
		}else{
			main.log("Error changing the lock state.");
			callback(null);
		}
	});
}

MacUnlockAccessory.prototype.getPowerState = function(callback) {
	// ioreg -n IODisplayWrangler |grep -i IOPowerManagement
	// 0 -> unlocked | 1 -> locked | 2 -> unknown
	
	var main = this;
	
	var command = "ioreg -n IODisplayWrangler |grep -i IOPowerManagement";
	var parameters = {user: this.username, host: this.ipAddress, password: this.password};
	var stream = ssh(command, parameters);
	
	stream.on('error', function (err) {
		main.log('Error: ' + err);
		callback(2);
	});
	
	stream.on('finish', function (err, stdout, stderr) {
		if (stdout.indexOf("CurrentPowerState")) {
			var state = substr(stdout.indexOf("CurrentPowerState") + stdout.length + 1, 1);
		
			if (state == "4") {
				callback(1);
			}else if (state == "1") {
				callback(0);
			}else{
				console.log(state);
				callback(2);
			}
		}else{
			callback(2);
		}
	});
}

MacUnlockAccessory.prototype.getScreenSaverState = function(callback) {
	// osascript -e 'tell application "System Events" to return running of screen saver preferences'
	// 0 -> unlocked | 1 -> locked | 2 -> unknown
	
	var main = this;
	
	var command = "osascript -e 'tell application \"System Events\" to return running of screen saver preferences'";
	var parameters = {user: this.username, host: this.ipAddress, password: this.password};
	var stream = ssh(command, parameters);
	
	stream.on('error', function (err) {
		main.log('Error: ' + err);
		callback(2);
	});
	
	stream.on('finish', function (err, stdout, stderr) {
		if (stdout == "true") {
			callback(1);
		}else if (stdout == "false") {
			callback(0);
		}else{
			console.log(stdout);
			callback(2);
		}
	});
}

MacUnlockAccessory.prototype.setLockState = function(state, callback) {
	// Lock -> "SleepDisplay" | Unlock -> "SleepDisplay -w"
	// *you must have SleepDisplay installed on your Mac
	// valid state values: "lock" | "unlock"
	
	var main = this;
	
	if (state == "lock") {
		var command = "SleepDisplay";
		var parameters = {user: this.username, host: this.ipAddress, password: this.password};
		var stream = ssh(command, parameters);
	
		stream.on('error', function (err) {
			main.log('Error: ' + err);
			callback();
		});
	
		stream.on('finish', function (err, stdout, stderr) {
			callback();
		});
		
	}else if (state == "unlock") {
		var command = "SleepDisplay -w";
		var parameters = {user: this.username, host: this.ipAddress, password: this.password};
		var stream = ssh(command, parameters);
	
		stream.on('error', function (err) {
			main.log('Error: ' + err);
			callback(null);
		});
	
		stream.on('finish', function (err, stdout, stderr) {
			main.typePassword(callback);
		});
	}
}

MacUnlockAccessory.prototype.typePassword = function(callback) {
	// osascript -e 'tell application "System Events" to keystroke $password'
	
	var main = this;
	
	var command = "osascript -e 'tell application \"System Events\" to keystroke " + this.password + "'";
	var parameters = {user: this.username, host: this.ipAddress, password: this.password};
	var stream = ssh(command, parameters);
	
	stream.on('error', function (err) {
		main.log('Error: ' + err);
		callback(null);
	});
	
	stream.on('finish', function (err, stdout, stderr) {
		callback(null);
	});
}

MacUnlockAccessory.prototype.getServices = function() {
	return [this.lockservice];
}
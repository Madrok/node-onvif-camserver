import * as util from 'util';
import * as fs from 'fs';
const exec = util.promisify(require('child_process').exec);


interface ExecRes {
	stdout: string;
	stderr: string;
}

/**
 * Get the user id for a posix user by username. Relies on the
 * unix funtion 'id'
 * @param username Posix user name
 * @returns NaN or user id
 */
export async function getUid(username: string): Promise<number> {
	try {
		let res: ExecRes = await exec('id -u ' + username);
		return Number(res.stdout.trim());
	} catch (e) { }
	return NaN;
}

/**
 * Get the group number for a named posix group. Relies on the
 * unix funtion 'id'
 * @param groupname Posix group name
 * @returns NaN or group id
 */
export async function getGid(groupname: string): Promise<number> {
	try {
		let res: ExecRes = await exec('id -g ' + groupname);
		return Number(res.stdout.trim());
	} catch (e) { }
	return NaN;
}

/**
 * Read the specified pid file and return the process number in 
 * it. If the file doesn't exist or has invalid data, NaN is returned
 * @param pidPath path to a PID file, typically in /var/run
 * @returns NaN or process id
 */
export function getRunPid(pidPath: string): number {
	try {
		let contents = fs.readFileSync(pidPath).toString();
		return Number(contents.trim());
	} catch (e) {
		return NaN;
	}
}

/*
was using ps-node but processes not showing up
could just use /proc/[PID]
export function isRunning(pidPath: string): Promise<boolean> {
	console.log('isRunning');
	var oldPid = getRunPid(pidPath);
	console.log(oldPid);
	return new Promise((resolve, reject) => {
		if (isNaN(oldPid)) {
			resolve(false);
			return;
		}
		ps.lookup({ pid: oldPid }, (err, resultList) => {
			if (err) {
				reject(err);
				return;
			}
			let process = resultList[0];
			console.log(resultList);
			if (process) {
				console.log(`FOUND process ${process.pid} ${process.command} ${process.arguments}`);
				resolve(true);
				return;

			}
			console.log("process not found in isRunning");
			resolve(false);
			return;

		});
	});
}
*/
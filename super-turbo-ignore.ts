// Derived from vercel/turborepo:packages/turbo-ignore/src/ignore.ts@29aeaf0
// See MIT License from Vercel, Inc
// Keeping in a single file to keep this portable and help with testing externally

import { execSync } from "node:child_process";
import { log } from "node:console";
import fs from "node:fs";

// the "≫" symbol
const LOG_PREFIX = "\u226B  ";

function info(message) {
	process.stderr.write(LOG_PREFIX + message + "\n");
}

function error(...args) {
	console.error(LOG_PREFIX, ...args);
}

function output(...args) {
	console.log(...args);
}

interface CommitCheck {
	result: "deploy" | "continue";
	reason: string;
}

/**
 * Check commit messages for indicator to force deployment
 * Adapted from turbo-ignore/src/checkCommit.ts@257d0c0
 */
function checkCommit(workspace: string): CommitCheck {
	const commitMessage = execSync("git show -s --format=%B").toString();

	const forceWorkspaceDeploy = `[vercel deploy ${workspace}]`;
	if (commitMessage.includes(forceWorkspaceDeploy)) {
		return {
			result: "deploy",
			reason: `Found commit message: ${forceWorkspaceDeploy}`,
		};
	}

	return {
		result: "continue",
		reason: `No deploy or skip string found in commit message.`,
	};
}

type Dependencies = Record<string, string>;

interface PackageJson {
	dependencies: Dependencies;
	devDependencies: Dependencies;
}

/**
 * Read turbo version from package.json
 * Adapted from turbo-ignore/src/getTurboVersion.ts@29aeaf0
 */
function getTurboVersion(): string {
	try {
		const raw = fs.readFileSync("package.json", "utf8");
		const packageJson = JSON.parse(raw) as PackageJson;
		const dependencies = packageJson.dependencies?.turbo;
		const devDependencies = packageJson.devDependencies?.turbo;
		const turboVersion = dependencies || devDependencies;
		if (turboVersion !== undefined) {
			info(`Inferred turbo version "${turboVersion}" from "package.json"`);
			return turboVersion;
		}
		return "latest";
	} catch (e) {
		error(`"package.json" could not be read`);
		throw e;
	}
}

interface Task {
	taskId: string;
	task: string;
	package: string;
	hash: string;
}

interface DryRun {
	packages: string[];
	tasks: Task[];
}

/**
 * Check if the deployment can be skipped by comparing with the previous commit
 * Allows forcing deployment from commit message
 * Assumes package has lockfile, package manager is set, and commit has reachable parent
 * @returns {boolean} whether or not the deployment can be skipped
 */
function superTurboIgnore(task: string, workspace: string): boolean {
	info(`Using Turborepo to determine if this project is affected by the commit...\n`);

	// check for TURBO_FORCE and bail early if it's set
	if (process.env.TURBO_FORCE === "true") {
		info("`TURBO_FORCE` detected");
		return false;
	}

	// check the commit message for force deploy
	const parsedCommit = checkCommit(workspace);
	if (parsedCommit.result === "deploy") {
		info(parsedCommit.reason);
		return false;
	}

	const turboVersion = getTurboVersion();
	const turbo = `turbo@${turboVersion}`;
	const command = `bunx ${turbo} run ${task} --filter="${workspace}" --dry=json`;
	// Assume cwd is the monorepo root
	const cwd = process.cwd();

	function getTaskDetails() {
		info(`Analyzing results of \`${command}\``);

		try {
			const stdout = execSync(command, { cwd, encoding: "utf8" });

			const parsed = JSON.parse(stdout) as DryRun;
			const { packages, tasks } = parsed;

			if (!packages.includes(workspace)) {
				throw "workspace not found";
			}

			return tasks;
		} catch (err) {
			error(`${err.name}: ${err.message}`);
			throw "command execution error";
		}
	}

	try {
		const currentTasks = getTaskDetails();
		// switch to parent commit
		execSync("git switch HEAD^ --detach");
		const previousTasks = getTaskDetails();
		// we don't need to restore since this action only inspects the commit

		const previousTaskIds = previousTasks.map((task) => task.taskId);
		const currentTaskIds = currentTasks.map((task) => task.taskId);
		const changedTasksMessage = `This commit changed the tasks for "${workspace}": ${previousTaskIds} => ${currentTaskIds}`;

		if (currentTasks.length !== previousTasks.length) {
			info(changedTasksMessage);
			return false;
		}

		const hashChanges: string[] = [];
		// Order should be deterministic by top-sort, so check pairs
		for (let i = 0; i < currentTasks.length; ++i) {
			const currentTask = currentTasks[i];
			const previousTask = previousTasks[i];
			if (currentTask.taskId !== previousTask.taskId) {
				info(changedTasksMessage);
				return false;
			}

			if (currentTask.hash !== previousTask.hash) {
				if (!hashChanges.includes(currentTask.package)) {
					hashChanges.push(currentTask.package);
				}
			}
		}

		if (hashChanges.length > 0) {
			if (hashChanges.length === 1) {
				info(`This commit affects "${workspace}"`);
			} else {
				// pop the last changed package which is the workspace itself
				hashChanges.pop();
				info(
					`This commit affects "${workspace}" and ${hashChanges.length} ${
						hashChanges.length > 1 ? "dependencies" : "dependency"
					} (${hashChanges.join(", ")})`
				);
			}

			return false;
		}

		info(`The task "${task}" for "${workspace}" is not affected by this commit`);
		return true;
	} catch (e) {
		error(`Failed to determine task hash diff`);
		error(e);
		throw e;
	}
}

const [task, workspace] = process.argv.slice(2);

if (superTurboIgnore(task, workspace)) {
	info("⏭ Ignoring the change");
	output(0);
} else {
	info("✓ Proceeding with deployment");
	output(1);
}

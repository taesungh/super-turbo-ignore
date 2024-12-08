// types derived from parts of vercel/turborepo

export interface CommitCheck {
	result: "deploy" | "continue";
	reason: string;
}

type Dependencies = Record<string, string>;

export interface PackageJson {
	dependencies: Dependencies;
	devDependencies: Dependencies;
}

interface Task {
	taskId: string;
	task: string;
	package: string;
	hash: string;
}

export interface DryRun {
	packages: string[];
	tasks: Task[];
}

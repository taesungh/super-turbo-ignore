# super-turbo-ignore

This action is an improved version of Turborepo's
[turbo-ignore](https://turbo.build/repo/docs/reference/turbo-ignore)
which works at the task level rather than only at the package level.

## Quick start

Run the action as a step and use `steps.<step_id>.output.status` with an `if` condition.
This action must be used from the monorepo root.

```yml
steps:
  - name: Check super-turbo-ignore
    id: super_turbo_ignore
    uses: HackAtUCI/super-turbo-ignore@v1
    with:
      workspace: web

  - name: Deploy
    if: steps.super_turbo_ignore.output.status == 1
    run: ...
```

## Usage

This action works by checking the hash for a given workspace and task and comparing that
with the corresponding task hash from the parent commit.

For workflows running on pull requests, actions/checkout provides a merge commit as if
the pull request were merged, so the comparison is against the base branch (e.g. main).
For workflows running on pushes, the parent commit is just that from `HEAD^`.

By specifying the proper inputs to tasks, job steps can be skipped for non-functional
changes such as updating README files or unit tests.

This action assumes the desired workflow (e.g. deployment) was successfully run on the
parent commit (if necessary) and can indicate when the workflow could be skipped because
the task hash is the same. This means that **Allow rebase merging** should be disabled
in the repository settings because a workflow running on pushes won't be able to compare
against the prior state of the branch from when the comparison was last run.

### Inputs

#### `task`

**Optional.** The task to execute. Defaults to `"build"`

#### `workspace`

**Required.** The workspace to filter on.

### Outputs

#### `status`

Status is 0 if changes can be ignored, 1 if changes should be deployed.

## License

The scripts and documentation in this project are released under the [MIT License](LICENSE).

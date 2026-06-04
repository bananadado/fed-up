# Repository Policy

## Branches

master:

* production branch
* protected
* sacred

The agent must never:

* push to master
* merge into master
* create branches from master
* suggest bypassing protections

staging:

* development integration branch

All work must:

1. branch from staging
2. merge into staging

## Allowed Actions

The agent may:

* read repository
* create issues
* update issues
* create branches
* push commits
* create merge requests
* inspect CI/CD status

## Forbidden Actions

The agent must not:

* force push
* rewrite history
* delete branches
* merge to master
* modify repository protections

## Issue Requirement

Every code change must be linked to an issue.

If no issue exists:

* create one first

## Merge Requirement

Every merge request must:

* target staging
* reference issue
* pass validation
* pass CI

# Agent Workflow

## Discovery

Identify:

* bugs
* failing tests
* code smells
* performance issues
* documentation gaps

Prioritize:

1. broken functionality
2. CI failures
3. correctness bugs
4. maintainability

## Branch Naming

feature/<issue-id>-description

Examples:

feature/123-fix-login-timeout

feature/456-remove-dead-code

## Commit Format

<issue-id>: short description

Example:

123: Fix timeout calculation

## Merge Request Format

Title:

<issue-id>: short description

Body:

* problem
* solution
* validation performed
* risks

## Pipeline Handling

Before marking work complete:

* inspect pipeline

If pipeline running:

* wait

If pipeline failed:

* investigate

If pipeline passed:

* continue

## Retry Limit

Maximum retries per issue:

3

After that:

* mark BLOCKED
* explain reason
* move on

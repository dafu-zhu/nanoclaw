---
name: commit
description: "Review changed code for reuse, quality, and efficiency, then fix any issues found. Run pre-commit hook, simplify code, commit, and push. Use when the user says /commit or asks to commit and push."
---

# Commit Skill

Run the full commit pipeline: pre-commit hook, code simplify review, commit, and push. Do NOT ask the user clarifying questions — just execute.

## Step 1: Pre-commit hook

Run the pre-commit hook to format code:

```bash
npm run format:fix
```

If it changes files, stage those changes too.

## Step 2: Code simplify review

Review ALL changed files (staged + unstaged) for:

- **Reuse:** duplicated logic that should be extracted or shared
- **Quality:** unclear naming, missing edge cases, dead code, security issues
- **Efficiency:** unnecessary allocations, redundant loops, O(n^2) where O(n) suffices

To find what changed, run:

```bash
git diff HEAD --name-only
git diff --cached --name-only
```

Read each changed file and look at the diffs (`git diff HEAD`). Fix any issues you find — prefer minimal, targeted edits. If no issues are found, move on. After fixing, re-run `npm run format:fix` and stage the fixes.

## Step 3: Stage and commit

1. Run `git status` and `git diff --cached` and `git log --oneline -5` in parallel.
2. Stage all modified/new files relevant to the current work (use `git add <file>` for specific files, not `git add -A`).
3. Write a commit message following this repo's convention: `type: concise description`. Types: `feat`, `fix`, `refactor`, `simplify`, `test`, `docs`, `chore`. If the simplify step made changes, include them in the same commit. Use a HEREDOC for the message:

```bash
git commit -m "$(cat <<'EOF'
type: description

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

4. If the commit fails due to pre-commit hook reformatting, stage the reformatted files and create a NEW commit (never amend).

## Step 4: Push

Push to the current branch's remote:

```bash
git push
```

If no upstream is set:

```bash
git push -u origin HEAD
```

If push fails due to divergence, tell the user — do NOT force push.

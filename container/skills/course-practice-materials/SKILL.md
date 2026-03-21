---
name: course-practice-materials
description: Generate extra practice materials — theory problems and computational exercises — for any academic course. Use when the user asks to "create practice problems," "generate exercises," "make a practice set," "give me extra problems," "computational exercises," "help me practice," or any request for supplementary study material. Also trigger when the user says "practice for exam," "review problems," "drill problems," or "exercises for Lecture X." This skill produces problem PDFs (with solutions) and optional code scripts, prioritizing course/textbook problems over AI-generated ones.
---

# Course Practice Materials Generator

## IMPORTANT: Long-Running Skill

This skill produces long-running output. Work directly and inline — do NOT use schedule_task or try to defer the work. Start immediately. Call `send_message` to report progress after each major section. Save progress to `wip.md` regularly so you can resume if paused.

---

## Persona

You are a meticulous course TA designing practice materials **tightly aligned with what was actually taught in class**. You prioritize existing materials (course problem sets, textbook exercises) over anything you generate yourself. You calibrate difficulty to the course level and ensure all problems reinforce the lecture content.

---

## Course Setup (First-Time Use)

**When this skill is first invoked for a course, or when no course context exists:**

Ask the user to provide course materials to enable high-quality practice generation:

### Required Materials
| Material | Purpose | Format |
|----------|---------|--------|
| **Syllabus** | Topic coverage, schedule, textbook list | PDF or text |
| **Textbook(s)** | Source of exercises and reading assignments | Title, author, edition; PDF if available |

### Strongly Recommended
| Material | Purpose | Format |
|----------|---------|--------|
| **Lecture notes/slides** | What was actually taught | PDF, LaTeX |
| **Prior problem sets + solutions** | Style calibration, reuse | PDF |
| **Prior exams + solutions** | Difficulty calibration | PDF |

### Optional (for computational exercises)
| Material | Purpose | Format |
|----------|---------|--------|
| **Course datasets** | Real data for applied problems | CSV, Excel, etc. |
| **Code examples** | Programming style to match | Python, R, etc. |

**Setup prompt:**
```
I'll create practice materials for your course. To generate high-quality, 
course-aligned exercises, please share:

1. **Syllabus** (required) — what topics are covered, which textbooks?
2. **Textbook(s)** (required) — title, author, edition; PDFs if available
3. **Lecture notes** (recommended) — what was actually taught
4. **Prior problem sets + solutions** (recommended) — for style matching
5. **Prior exams** (recommended) — for difficulty calibration
6. **Course datasets** (optional) — for computational exercises

Which lecture(s) should I create practice materials for?
```

**After receiving materials:**
1. Read the syllabus to understand topic flow
2. Map lecture topics to textbook sections
3. Identify available exercises from textbooks and prior problem sets
4. Note the course's difficulty level and style
5. Confirm readiness: "I've reviewed your materials. Ready to create practice for Lecture X on [topic]."

---

## Core Principles

### Priority 1: Course Problem Sets
Problems from the course's own problem sets and exams. These are perfectly calibrated.
- Copy full problem statement into the practice PDF
- Solution: reference the course solution document

### Priority 2: Textbook Exercises
Problems from the course's required/recommended textbooks.
- Reference: "See [Textbook] Ch. X, Exercise Y"
- Students have access to textbooks; no need to restate
- Check ALL course textbooks, not just the primary one

### Priority 3: Original Problems
Only when a topic is NOT covered in any course textbook.
- Write full statement and full solution
- Match the style and difficulty of course materials
- Flag these clearly: "[Original problem]"

**Decision rule:** If the topic IS covered in any course textbook → direct to that textbook's exercises. Generate original problems ONLY when no textbook covers the topic.

---

## Budget and Distribution

Each practice set should contain a balanced mix:

### Recommended Structure
- **Total problems**: 15-25 exercises (adjust based on user preference)
- **Difficulty distribution**: 
  - ★ Easy (30%): Direct application of definitions/formulas
  - ★★ Medium (40%): Requires combining concepts or multi-step reasoning
  - ★★★ Hard (30%): Challenging proofs, edge cases, or synthesis

### Problem Types
- **Theory problems**: Proofs, derivations, conceptual questions
- **Computation problems**: Apply formulas, work through algorithms
- **Applied problems**: Real-world scenarios using course concepts
- **Coding exercises**: Implement algorithms, analyze data (if course includes programming)

---

## Output Structure

### Component 1: Reading Assignments (first page of problems PDF)

```latex
\section*{Reading Assignments}

\textbf{Primary:}
\begin{itemize}
  \item [Textbook] Ch. X, §X.1–X.3 (main topic).
        Focus on Definition X.1 and Theorem X.2.
  \item [Secondary Textbook] Ch. Y, §Y.1 (alternative treatment).
\end{itemize}

\textbf{Review Questions:} [Textbook] Ch. X end-of-chapter: 1–5, 8, 12.

\textbf{Optional:} [Paper/Resource] for advanced treatment.
```

**Reading assignment rules:**
- Assign sections from ALL relevant course textbooks
- Include specific section numbers and what to focus on
- Papers/online resources only when textbooks insufficient
- Target ~30-50 pages total reading per lecture

### Component 2: Problems PDF (`practice_lecX_problems.pdf`)

```latex
\documentclass{article}
% ... preamble ...

\begin{document}

\section*{Practice Problems: Lecture X — [Topic]}

\subsection*{Reading Assignments}
[As above]

\subsection*{Problems}

\textbf{Problem 1} ★ [Topic Tag] [Source: Course PS2 or Textbook Ch.3 Ex.5]

[Problem statement]

\textbf{Problem 2} ★★ [Topic Tag] [Source]

[Problem statement]

% ... continue ...

\end{document}
```

**Format rules:**
- Each problem has: difficulty (★/★★/★★★), topic tag, source tag
- Course PS problems: copy full statement
- Textbook exercises: reference only ("See [Book] Ch.X Ex.Y")
- Original problems: full statement with [Original] tag

### Component 3: Solutions PDF (`practice_lecX_solutions.pdf`)

```latex
\section*{Solutions}

\textbf{Problem 1 Solution}
[Source: PS2] See Problem Set 2 Solutions, Problem 3.

\textbf{Problem 2 Solution}
[Source: Textbook] See [Textbook] Solutions Manual, Ch. X.

\textbf{Problem 3 Solution}
[Original]

[Full detailed solution]
```

**Solution rules:**
- Course PS: reference course solutions
- Textbook: reference textbook solutions/answer key
- Original: write full solution

### Component 4: Code Script (optional, `practice_lecX_exercises.py`)

If the course includes programming:
- Standalone script using course-provided datasets
- Clear problem statements as comments
- Verification steps to check answers
- Match the programming language used in course

---

## Workflow

### Step 1: Identify Lecture and Gather Context

1. Determine which lecture(s) to cover
2. Read the lecture slides/notes
3. Identify the main topics and concepts taught
4. Map topics to textbook sections (build this mapping incrementally)

### Step 2: Source the Problems

Fill top-down by priority:

```
PRIORITY 1: Course problem sets and exams
  → Find problems on this topic from PS1, PS2, midterm, etc.
  → These are gold — perfectly calibrated

PRIORITY 2: Textbook exercises
  → Check ALL course textbooks
  → Find exercises matching lecture topics
  → Reference by chapter and exercise number

PRIORITY 3: Original problems
  → Only for topics with NO textbook coverage
  → Write full statement and full solution
  → Match course style and difficulty
```

### Step 3: Compile Reading Assignments

For each major topic:
1. Identify relevant textbook sections
2. Specify what to focus on (theorems, definitions, examples)
3. Include review questions from textbook
4. Add optional advanced readings if appropriate

### Step 4: Generate LaTeX and Code

1. Copy templates from `assets/`
2. Fill in problems and solutions following format rules
3. Generate code script if applicable
4. Compile to PDF
5. Present all outputs

---

## Topic-to-Textbook Mapping

Maintain and build this mapping incrementally as you work through lectures:

```markdown
## Lecture X: [Topic]

### Textbook Coverage
- [Primary Textbook] Ch. A, §A.1-A.3: [specific concepts]
- [Secondary Textbook] Ch. B, §B.2: [alternative treatment]

### Course PS Problems
- PS2 Problem 3: [topic]
- Midterm Problem 1b: [topic]

### Textbook Exercises
- [Primary] Ch. A: Exercises 1-5, 8, 12
- [Secondary] Ch. B: Problems 2, 4

### Topics Needing Original Problems
- [Specific concept not in any textbook]
```

When generating practice materials for a new lecture, update this mapping.

---

## Quality Checklist

Before delivering, verify:

- [ ] Course setup completed (syllabus, textbooks collected)
- [ ] All course textbooks checked for relevant exercises
- [ ] Difficulty distribution is balanced (roughly 30/40/30)
- [ ] Course PS/exam problems included as Priority 1
- [ ] Textbook exercises from multiple textbooks (if applicable)
- [ ] Reading assignments reference all relevant textbook sections
- [ ] Original problems only when no textbook coverage
- [ ] Original problems match course style and difficulty
- [ ] Solutions reference appropriate sources
- [ ] Code script uses course datasets (if applicable)
- [ ] LaTeX compiles cleanly
- [ ] All files delivered to outputs

---

## Example Usage Patterns

**Pattern 1: First time for a course**
```
User: Create practice problems for my real analysis class.

Claude: I'll create practice materials for your course. Please share:
1. Syllabus — what topics are covered, which textbooks?
2. Textbook(s) — title, author, edition
3. Lecture notes — what was actually taught
4. Prior problem sets — for style matching
...
```

**Pattern 2: With established context**
```
[After course materials have been provided]

User: Create practice problems for Lecture 5 on compactness.

Claude: I'll create practice materials for Lecture 5 on compactness.
[Check textbook mapping] → [Find course PS problems] → 
[Find textbook exercises] → [Generate if needed] → 
[Compile reading assignments] → [Generate PDFs]
```

**Pattern 3: Computational focus**
```
User: I need coding exercises for our machine learning unit.

Claude: I'll create computational exercises. Do you have:
- Course datasets I should use?
- Example code from class to match style?
- Programming language preference?
...
```

---

## Resources

### assets/practice_problems_template.tex
LaTeX template for problems PDF with:
- Reading assignment section
- Problem formatting with difficulty stars and tags
- Clean, professional layout

### assets/practice_solutions_template.tex
LaTeX template for solutions PDF with:
- Solution formatting
- Source references

### scripts/compile_latex.py
Python script to compile LaTeX to PDF.

Usage: `python scripts/compile_latex.py <file.tex> [output_dir]`

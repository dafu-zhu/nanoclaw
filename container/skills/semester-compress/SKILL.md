---
name: semester-compress
description: Apply the MIT NotebookLM "Semester in 48 Hours" method to rapidly master a topic using course materials. Generates three strategic outputs — mental models, expert disagreements, and depth-testing questions — that compress a topic to its essential structure. Use when the user says "compress," "master quickly," "48-hour method," "mental models for," "what do experts disagree on," "depth questions for," or any request to rapidly build deep understanding of a topic rather than just reviewing content.
---

# Semester Compress — Strategic Mastery Framework

## IMPORTANT: Long-Running Skill

This skill produces long-running output. Work directly and inline — do NOT use schedule_task or try to defer the work. Start immediately. Call `send_message` to report progress after each phase. Save progress to `wip.md` regularly so you can resume if paused.

---

## Origin

Based on a method where an MIT grad student passed a qualifying exam on a topic he'd never studied — in 48 hours — by uploading 6 textbooks, 15 papers, and all class transcripts to Google NotebookLM, then asking three strategic questions instead of requesting summaries.

The core insight: the difference between a semester and 48 hours is not the amount of content — it's knowing what questions to ask.

Your TAs have the same access to course materials. This skill implements the same three questions.

---

## Persona

You are a senior researcher who has already mastered this field and is now distilling what took you years into the essential structures a smart learner needs. You don't summarize — you extract the thinking frameworks that separate someone who truly understands from someone who memorized the textbook.

---

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| **Topic** | Yes | What to compress. Can be a full course, a chapter, a concept cluster, or an exam scope. |
| **Scope** | No | How much to cover. "Full course" vs. "Lectures 1-5" vs. "Chapter 3." Defaults to whatever materials are available. |
| **Goal** | No | Why the user needs this. Exam prep, interview, research project, prerequisite catch-up. Shapes emphasis. |

---

## Behavior Protocol

### Phase 0: Material Inventory

Before generating anything, survey available course materials:

1. Check `/workspace/extra/` for course-specific directories (textbooks, slides, transcripts)
2. Check `/workspace/group/` for accumulated notes, problem sets, conversation history
3. If lecture transcripts exist, they are gold — professor emphasis reveals what matters most
4. Report what you found: "I have access to [X textbooks, Y lecture transcripts, Z problem sets]. Proceeding with the compress framework."

If no materials are available, work from your own knowledge but flag this clearly.

### Phase 1: Mental Models

**Question:** "What are the fundamental mental models shared by every expert in this field?"

For the given topic/scope, extract 5-10 mental models that an expert carries in their head. These are NOT definitions or theorems — they are thinking frameworks.

**What makes a good mental model:**
- It changes how you approach problems, not just what you know
- It connects seemingly unrelated concepts
- An expert would nod and say "yes, that's how I think about it"
- A student who memorized the textbook would NOT arrive at it naturally

**Format for each mental model:**
```
### Mental Model N: [Name]

**The framework:** [1-3 sentences — the actual mental model]

**Why experts think this way:** [What experience/insight leads to this framing]

**How it changes your approach:** [Concrete example of how this model makes you solve a problem differently than a textbook approach would]

**Course connection:** [Where this shows up in the specific course materials]
```

After extracting mental models, call `send_message` with a summary of all models found.

### Phase 2: Expert Disagreements

**Question:** "Where do experts fundamentally disagree, and what is the best argument from each side?"

Identify 3-7 genuine points of contention in the field. These are NOT "some people find X hard" — they are substantive disagreements about methods, interpretations, or approaches.

**What qualifies as a genuine disagreement:**
- Active researchers would take different sides
- The disagreement reflects a real trade-off, not ignorance
- Understanding both sides deepens your grasp of the field
- Exam questions or interview questions often probe these boundaries

**Format for each disagreement:**
```
### Disagreement N: [Topic]

**The tension:** [What the disagreement is about]

**Side A:** [Best argument for this position]

**Side B:** [Best argument for the other position]

**What this reveals:** [Why understanding this disagreement matters — what deeper principle it exposes]

**Course stance:** [If the professor/textbook takes a side, note it]
```

After extracting disagreements, call `send_message` with a summary.

### Phase 3: Depth Questions

**Question:** "Generate questions that distinguish someone who truly understands from someone who just memorized."

Create 10-15 questions across the topic scope. These are NOT homework problems or textbook exercises — they are diagnostic questions that probe real understanding.

**Three categories of depth questions:**

**Category A — Conceptual Inversion (5-6 questions)**
Take a standard result and ask the student to reason about what happens when assumptions break. "If X were not true, what would change?" Forces engagement with *why* things work, not just *that* they work.

**Category B — Cross-Topic Synthesis (4-5 questions)**
Ask questions that require connecting concepts from different parts of the course. "How does X from Week 2 relate to Y from Week 6?" A memorizer treats these as separate topics; someone who understands sees the thread.

**Category C — Expert Judgment (3-4 questions)**
Present a scenario and ask "what would you do?" with no single right answer. Tests whether the student has internalized the mental models from Phase 1. "Given this situation, which method would you choose and why?"

**Format for each question:**
```
### Q[N] [Category] — [Topic Tag]

**Question:** [The question]

**What it tests:** [What understanding this probes — why a memorizer would struggle]

**Strong answer includes:** [Key elements an expert's answer would contain — NOT a full solution, just the markers of understanding]
```

After generating questions, call `send_message` with a count and category breakdown.

---

## Output Options

The user can request output in two formats:

### Option A: Chat Summary (default)
Deliver all three phases as structured messages via `send_message`. Good for quick mastery sessions.

### Option B: LaTeX PDF
Trigger: user says "PDF", "document", "printable", or "notes format."

Use the template from `assets/template.tex` (from topic-tutorial-notes skill). Structure:

```
Title: "Mastery Framework: [Topic]"
Subtitle: "Mental Models, Expert Disagreements, and Depth Questions"

Part I: Mental Models (5-10 models)
Part II: Expert Disagreements (3-7 disagreements)
Part III: Depth Questions (10-15 questions)
Appendix: Course Material Index (what was used to generate this)
```

Use `insight` boxes for mental models, `intuition` boxes for disagreement analysis, and `milestone` boxes for depth question markers.

Compile and deliver both `.tex` and `.pdf`.

---

## Integration with Other Skills

This skill complements — does not replace — existing study skills:

| After Semester Compress... | Follow up with... |
|---|---|
| Mental models identified | `topic-tutorial-notes` for deep dive on any model that needs unpacking |
| Disagreements surfaced | Chat discussion to explore the nuances |
| Depth questions generated | `course-practice-materials` for computational exercises on weak areas |
| Weak spots revealed | Targeted review of specific lectures/chapters |

**Suggested workflow for exam prep:**
1. Run semester-compress on full exam scope
2. Attempt all depth questions — identify gaps
3. Use topic-tutorial-notes for gap topics
4. Use course-practice-materials for computational drilling
5. Re-attempt depth questions to verify mastery

---

## Quality Checklist

Before delivering, verify:

- [ ] Material inventory completed — what sources were used is clear
- [ ] Mental models are genuinely frameworks, not restatements of definitions
- [ ] Each mental model includes a concrete "how it changes your approach" example
- [ ] Disagreements are substantive, not trivial or pedagogical
- [ ] Depth questions span all three categories (inversion, synthesis, judgment)
- [ ] Depth questions cannot be answered by quoting a definition
- [ ] Course-specific connections are grounded in actual materials (not hallucinated)
- [ ] If PDF requested: compiles cleanly, both files delivered
- [ ] Progress updates sent via `send_message` after each phase

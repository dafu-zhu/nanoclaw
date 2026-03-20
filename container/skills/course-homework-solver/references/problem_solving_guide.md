# Problem Solving Guide

A comprehensive guide for solving academic homework problems with rigor and clarity.

---

## General Problem-Solving Framework

### Phase 1: Understanding
1. **Read the entire problem** before attempting anything
2. **Identify knowns** — what information is given?
3. **Identify unknowns** — what are you asked to find/prove?
4. **Identify constraints** — what conditions must hold?
5. **Determine problem type** — proof, computation, derivation, or conceptual?

### Phase 2: Planning
1. **Recall relevant material** — which theorems, definitions, methods apply?
2. **Choose an approach** — direct, contradiction, induction, computation?
3. **Sketch the solution** — outline major steps before writing formally
4. **Anticipate difficulties** — where might things get tricky?

### Phase 3: Execution
1. **Write clearly** — each step should follow logically
2. **Justify everything** — cite theorems, explain reasoning
3. **Check as you go** — verify intermediate results
4. **Maintain notation** — be consistent with course conventions

### Phase 4: Verification
1. **Check the answer** — does it satisfy the original problem?
2. **Sanity check** — does the result make intuitive sense?
3. **Review edge cases** — does it work in special cases?
4. **Read through** — is the argument clear and complete?

---

## Strategies by Problem Type

### Proof Problems

**Direct Proof**
- Start from hypotheses, derive conclusion step by step
- "Assume [hypothesis]. Then by [theorem], we have... Therefore [conclusion]."

**Proof by Contradiction**
- Assume the negation of what you want to prove
- Derive a contradiction with known facts or hypotheses
- "Suppose, for contradiction, that [negation]. Then... But this contradicts [fact]. Therefore [original claim]."

**Proof by Induction**
- Base case: verify for n = 0 (or smallest value)
- Inductive step: assume for n = k, prove for n = k + 1
- "We proceed by induction. Base case (n = 0): ... Inductive step: Assume [P(k)]. We show [P(k+1)]: ..."

**Proof by Cases**
- Partition into exhaustive, mutually exclusive cases
- Prove each case separately
- "We consider two cases. Case 1: [condition]. Then... Case 2: [opposite]. Then..."

**Construction Proofs**
- To prove existence, construct an explicit example
- Verify the construction satisfies required properties

### Computation Problems

**Setup Phase**
1. Write down the formula/algorithm you'll use
2. Identify all inputs needed
3. Organize given data clearly

**Execution Phase**
1. Substitute values systematically
2. Show intermediate calculations
3. Simplify step by step
4. Box or clearly state final numerical answer

**Verification Phase**
1. Check units/dimensions
2. Verify answer is in expected range
3. Plug answer back if possible

### Derivation Problems

**Forward Derivation** (given start, find end)
1. Write starting expression
2. Apply valid transformations, justifying each
3. Continue until target is reached
4. Each line should follow from the previous

**Backward Derivation** (given end, justify from start)
1. Understand what the target expression means
2. Identify what tools could produce it
3. Work backwards to find the path
4. Write up forwards

**Key Derivation Techniques**
- Expand definitions
- Apply known identities
- Factor and simplify
- Substitute equivalent expressions
- Use algebraic manipulation

### Conceptual Problems

**Explain a concept**
1. Start with a clear definition
2. Give the intuition — why does this make sense?
3. Provide a concrete example
4. Connect to related concepts

**Compare and contrast**
1. State key similarities
2. State key differences
3. Give examples illustrating each
4. Discuss when each is used

**Apply to a scenario**
1. Identify which concepts are relevant
2. Map the scenario to the abstract framework
3. Draw conclusions using the theory
4. Interpret back in context

---

## Citation Standards

### Citing Course Material

**Theorems and Propositions**
- "By Theorem 3.2 (Lecture 5)..."
- "Using the [Name] Theorem from class..."
- "As stated in [Textbook], Theorem X.Y..."

**Definitions**
- "By Definition 2.1..."
- "Recall that [term] is defined as..."

**Methods and Algorithms**
- "Using the method from Lecture 7..."
- "Applying the algorithm described in [Textbook], Section X.Y..."

**Prior Results**
- "From Problem 2(a), we have..."
- "As shown in Problem Set 3..."

### What NOT to Do

❌ "It is well-known that..." (unless explicitly taught)
❌ "One can show that..." (show it or cite it)
❌ "Clearly..." (for non-obvious claims)
❌ "By a standard result..." (cite the specific result)
❌ Introducing theorems from outside the course without noting it

---

## Mathematical Rigor Guidelines

### Appropriate Rigor

Match the course's level:
- **Undergraduate courses**: Focus on correct application, clear reasoning
- **Graduate courses**: More formal proofs, attention to conditions
- **Applied courses**: Emphasis on computation and interpretation
- **Theoretical courses**: Emphasis on proofs and edge cases

### Common Rigor Issues

**Under-rigorous**
- Skipping steps without justification
- Using results without citation
- Hand-waving over difficulties
- Ignoring edge cases

**Over-rigorous**
- Proving things the course assumes
- Excessive formalism beyond course level
- Unnecessary epsilon-delta when course uses limits informally

### Balancing Act

- Justify steps that use non-trivial results
- You may skip "obvious" algebra (but be careful)
- When in doubt, cite or explain
- Match the style of course solutions

---

## Formatting Best Practices

### LaTeX Structure

```latex
\section*{Problem X}
[Full problem statement]

\begin{solution}
[Introduction/setup if needed]

(a) [Solution for part a]

(b) [Solution for part b]

[Conclusion if needed]
\end{solution}
```

### Equation Formatting

**Standalone equations** (important results):
```latex
\begin{equation}
    E[X] = \sum_{i} x_i p_i
\end{equation}
```

**Multi-line derivations**:
```latex
\begin{align*}
    f(x) &= (x+1)^2 \\
         &= x^2 + 2x + 1
\end{align*}
```

**Inline math**: Use `$...$` for short expressions within sentences.

### Writing Style

- **Active voice**: "We compute..." not "It is computed..."
- **Clear transitions**: "Therefore...", "Since...", "By..."
- **Define before use**: Introduce variables before using them
- **One idea per sentence**: Keep sentences focused

---

## Quality Checklist

Before submitting, verify:

### Content
- [ ] Problem statement is included
- [ ] All parts are answered
- [ ] All steps are justified
- [ ] Course material is cited
- [ ] No external results used without warning

### Logic
- [ ] Each step follows from the previous
- [ ] Assumptions are stated
- [ ] Conclusions are clearly marked
- [ ] No circular reasoning

### Presentation
- [ ] LaTeX compiles without errors
- [ ] Equations are properly formatted
- [ ] Notation is consistent
- [ ] Solution is readable and organized

### Verification
- [ ] Answer makes sense
- [ ] Edge cases considered
- [ ] Computation checked
- [ ] Units/dimensions correct (if applicable)

# LaTeX Best Practices for Lecture Notes

A comprehensive guide for creating high-quality, pedagogically effective lecture notes.

---

## Mathematical Content Formatting

### Inline vs Display Math

**Inline math** (`$...$`): Use for short expressions that flow naturally in text.
- "The variable $x$ represents..."
- "When $n \to \infty$, the limit is..."

**Display math** (`\begin{equation}...\end{equation}`): Use for important formulas that deserve emphasis.
```latex
The expected value is given by
\begin{equation}
    E[X] = \sum_{i=1}^{n} x_i p_i.
\end{equation}
```

**Multi-line derivations** (`\begin{align*}...\end{align*}`): Use for step-by-step calculations.
```latex
\begin{align*}
    E[X^2] &= \sum_{i=1}^{n} x_i^2 p_i \\
           &= \sum_{i=1}^{n} x_i^2 \cdot \frac{1}{n} \\
           &= \frac{1}{n} \sum_{i=1}^{n} x_i^2.
\end{align*}
```

### Grammatical Integration

**Every equation must be part of a sentence.** Equations are not standalone objects.

❌ Wrong:
```latex
Consider the function $f$.
\begin{equation}
    f(x) = x^2
\end{equation}
Its derivative is $f'(x) = 2x$.
```

✅ Correct:
```latex
Consider the function $f$ defined by
\begin{equation}
    f(x) = x^2.
\end{equation}
Its derivative is $f'(x) = 2x$.
```

### Punctuation with Equations

- Equations are part of sentences, so they need punctuation
- End with a period if the equation ends a sentence
- End with a comma if the sentence continues
- No punctuation if followed by "where" clause

### Notation Consistency

- Define every symbol on first use
- Use consistent notation throughout (e.g., always $\mathbf{x}$ for vectors, not sometimes $\vec{x}$)
- Match the professor's notation from slides/audio

---

## Sidebar Integration Strategies

### When to Use Each Sidebar Type

**`\begin{professorsnote}...\end{professorsnote}`** (Blue border)
Use for:
- Direct quotes or paraphrases of what the professor said
- Professor's practical advice and opinions
- Verbal asides and digressions
- Responses to student questions
- Warnings and common mistakes

Example:
```latex
\begin{professorsnote}
``In practice, you should always check this condition first — it saves a lot of computation.''
\end{professorsnote}
```

**`\begin{insight}...\end{insight}`** (Green border)
Use for:
- YOUR explanations connecting concepts across lectures
- Context that helps understanding but wasn't said by professor
- Simplified restatements of complex arguments
- Connections to prior knowledge

Example:
```latex
\begin{insight}
This is essentially the same technique we used in Lecture 3 for handling boundary conditions, but applied in a different context.
\end{insight}
```

**`\begin{intuition}...\end{intuition}`** (Orange border)
Use for:
- Proof strategies and key ideas
- "Why this formula looks this way" explanations
- High-level understanding before diving into details
- The "aha moment" explanation

Example:
```latex
\begin{intuition}
The key idea is that we can decompose any function into orthogonal components. Once we see this, the formula follows naturally from linear algebra.
\end{intuition}
```

**`\begin{interview}...\end{interview}`** (Red/Crimson border)
Use for:
- How this concept is tested in quant interviews (trading, risk, quant research)
- Alternative formulations that interviewers prefer over the academic version
- Common interview questions targeting this concept
- Bridging academic rigor and interview-style explanation (e.g., primitive vs. classical OLS assumptions — explain the equivalence)
- "If asked about X in an interview, lead with Y" style guidance

Example:
```latex
\begin{interview}
Interviewers often ask: ``What are the assumptions of OLS?'' The textbook gives primitive conditions (linear in parameters, random sampling, no perfect collinearity, zero conditional mean, homoskedasticity), but hiring managers typically expect the Gauss-Markov framing. Know both — and be ready to show how the primitive conditions imply the classical ones.
\end{interview}
```

### Sidebar Placement

- Place sidebars **after** the content they comment on
- Don't interrupt a proof or derivation with a sidebar
- Don't stack multiple sidebars consecutively
- Keep sidebars concise (2-5 sentences typically)

### What Does NOT Go in Sidebars

- Substantive mathematical content (proofs, derivations) — these belong in main text
- Definitions and theorems — use proper environments
- Core examples — integrate into main text
- Essential steps in an argument

---

## Structure and Organization

### Document Flow

1. **Introduction**: Overview of topic, connection to prior lectures
2. **Motivation**: Why do we care about this?
3. **Definitions**: Formal setup
4. **Main Results**: Theorems, propositions
5. **Proofs/Derivations**: How we get the results
6. **Examples**: Concrete applications
7. **Summary**: Key takeaways

### Section Organization

- Structure by **topic**, not by slide number
- Each section should be logically self-contained
- Use subsections for sub-topics, not for "slide 5, slide 6"
- Include cross-references to related sections

### Theorem Environment Usage

```latex
\begin{definition}[Name if applicable]
[Formal definition.]
\end{definition}

\begin{theorem}[Name if applicable]
[Statement of theorem.]
\end{theorem}

\begin{proof}
[Proof as given in lecture.]
\end{proof}
```

- Use `[Name]` parameter for named results (e.g., "Cauchy-Schwarz Inequality")
- Follow every theorem with a proof, intuition, or reference to where proof appears
- Don't leave theorems "orphaned" without explanation

---

## Common Pitfalls

### Mathematical Errors

- **Missing assumptions**: Always state all conditions
- **Undefined notation**: Define before first use
- **Wrong theorem attribution**: Cite the course source, not external references
- **Skipped steps**: Include enough detail for the reader to follow

### Formatting Errors

- **Unescaped special characters**: `%`, `&`, `$`, `#`, `_` must be escaped in text
- **Mismatched braces**: Especially in tcolorbox environments
- **Missing packages**: Ensure all required packages are included
- **Overfull hboxes**: Break long equations appropriately

### Pedagogical Errors

- **Too formal**: Match the course's level of rigor
- **Too informal**: Maintain mathematical precision
- **Missing motivation**: Explain WHY before WHAT
- **Wall of equations**: Balance math with prose explanation

---

## Compilation Checklist

Before finalizing:

- [ ] All packages imported in preamble
- [ ] No unescaped special characters
- [ ] All environments properly closed
- [ ] Cross-references resolve correctly
- [ ] TOC generates properly (requires 2 passes)
- [ ] No overfull/underfull box warnings that affect layout
- [ ] PDF opens correctly and all pages render

### Compilation Command

```bash
pdflatex -interaction=nonstopmode document.tex
pdflatex -interaction=nonstopmode document.tex  # Second pass for TOC/refs
```

Or use the provided script:
```bash
python scripts/compile_latex.py document.tex output_dir/
```

---

## Style Guidelines

### Voice and Tone

- Use "we" naturally: "We want to show that...", "We can decompose..."
- Active voice preferred: "The theorem states..." not "It is stated by the theorem..."
- Direct language: "This shows that..." not "It can be seen that this shows..."

### Paragraph Structure

- One idea per paragraph
- Topic sentence first
- Mathematical content integrated, not dumped
- Transitions between paragraphs

### Balance

- Balance formal statements with intuitive explanations
- Balance mathematical rigor with accessibility
- Balance detail with readability
- Balance slides content with audio insights

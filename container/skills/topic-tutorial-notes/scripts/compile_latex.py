#!/usr/bin/env python3
"""
compile_latex.py — Compile LaTeX files to PDF

Usage:
    python compile_latex.py <input.tex> [output_dir]

Arguments:
    input.tex   — Path to the .tex file to compile
    output_dir  — Directory to place the PDF (default: same as input)

Features:
    - Runs pdflatex twice for cross-references
    - Cleans up auxiliary files
    - Reports errors clearly
"""

import subprocess
import sys
import os
import shutil


def compile_latex(tex_path: str, output_dir: str = None) -> bool:
    """
    Compile a LaTeX file to PDF.
    
    Args:
        tex_path: Path to the .tex file
        output_dir: Directory for output (default: same as input)
    
    Returns:
        True if compilation succeeded, False otherwise
    """
    # Validate input
    if not os.path.exists(tex_path):
        print(f"Error: File not found: {tex_path}")
        return False
    
    if not tex_path.endswith('.tex'):
        print(f"Error: Input must be a .tex file: {tex_path}")
        return False
    
    # Set up paths
    tex_dir = os.path.dirname(os.path.abspath(tex_path))
    tex_name = os.path.basename(tex_path)
    base_name = tex_name[:-4]  # Remove .tex
    
    if output_dir is None:
        output_dir = tex_dir
    else:
        output_dir = os.path.abspath(output_dir)
        os.makedirs(output_dir, exist_ok=True)
    
    # Compile command
    compile_cmd = [
        'pdflatex',
        '-interaction=nonstopmode',
        '-halt-on-error',
        f'-output-directory={tex_dir}',
        tex_path
    ]
    
    print(f"Compiling {tex_name}...")
    
    # Run pdflatex twice (for cross-references, TOC, etc.)
    for pass_num in [1, 2]:
        print(f"  Pass {pass_num}/2...")
        result = subprocess.run(
            compile_cmd,
            capture_output=True,
            text=True,
            cwd=tex_dir
        )
        
        if result.returncode != 0:
            print(f"\nCompilation failed on pass {pass_num}!")
            print("\n=== LaTeX Error Output ===")
            # Extract error lines
            for line in result.stdout.split('\n'):
                if line.startswith('!') or 'Error' in line or 'error' in line:
                    print(line)
            print("\n=== Full Log ===")
            print(result.stdout[-2000:])  # Last 2000 chars
            return False
    
    # Check if PDF was created
    pdf_path = os.path.join(tex_dir, f"{base_name}.pdf")
    if not os.path.exists(pdf_path):
        print(f"Error: PDF not created at {pdf_path}")
        return False
    
    # Move PDF to output directory if different
    if output_dir != tex_dir:
        final_pdf = os.path.join(output_dir, f"{base_name}.pdf")
        shutil.move(pdf_path, final_pdf)
        pdf_path = final_pdf
    
    # Clean up auxiliary files
    aux_extensions = ['.aux', '.log', '.out', '.toc', '.fls', '.fdb_latexmk', '.synctex.gz']
    for ext in aux_extensions:
        aux_file = os.path.join(tex_dir, f"{base_name}{ext}")
        if os.path.exists(aux_file):
            os.remove(aux_file)
    
    print(f"\nSuccess! PDF created: {pdf_path}")
    return True


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    tex_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None
    
    success = compile_latex(tex_path, output_dir)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()

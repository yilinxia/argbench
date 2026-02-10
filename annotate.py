#!/usr/bin/env python3
"""
Argument Mining Annotation Script

This script processes essay text files and generates argument annotations
using three different LLM providers: Gemini, Claude (AWS Bedrock), and Azure OpenAI.
Each run creates a timestamped log folder with annotations and statistics.
"""

import os
import json
import re
import glob
from pathlib import Path
from datetime import datetime
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

# Load configuration
def load_config():
    with open("llm.key", "r") as f:
        return json.load(f)

CONFIG = load_config()

# Annotation prompt template
ANNOTATION_PROMPT = """You are an expert in argument mining and discourse analysis. Your task is to annotate argumentative essays by identifying argument components and their relationships.

## Annotation Schema

### Entity Types:
1. **MajorClaim**: The main thesis or central claim of the essay. Usually appears in the introduction or conclusion.
2. **Claim**: A statement that supports or attacks the MajorClaim. Claims express the author's stance on sub-topics.
3. **Premise**: Evidence, reasoning, or examples that support or attack a Claim.

### Attributes:
- **Stance**: For Claims only. Indicates whether the Claim supports (For) or opposes (Against) the MajorClaim.

### Relations:
- **supports**: The source argument component provides support for the target.
- **attacks**: The source argument component opposes or contradicts the target.

## Output Format (BRAT Standoff Format)

Generate annotations in this exact format:

1. **Entity annotations** (T lines):
   `T<id>\t<Type> <start_offset> <end_offset>\t<text>`
   - id: Sequential number starting from 1
   - Type: MajorClaim, Claim, or Premise
   - start_offset: Character position where the span starts (0-indexed)
   - end_offset: Character position where the span ends
   - text: The exact text span from the essay

2. **Attribute annotations** (A lines):
   `A<id>\tStance T<entity_id> <For|Against>`
   - Only for Claim entities
   - For: The claim supports the MajorClaim
   - Against: The claim opposes the MajorClaim

3. **Relation annotations** (R lines):
   `R<id>\t<supports|attacks> Arg1:T<source_id> Arg2:T<target_id>`
   - source_id: The entity providing support/attack
   - target_id: The entity being supported/attacked

## Important Rules:
1. Character offsets must be EXACT - count characters precisely from the start of the text (0-indexed).
2. The text span must match EXACTLY what appears at those offsets.
3. Every Claim must have a Stance attribute.
4. Relations typically flow: Premise -> Claim -> MajorClaim
5. Claims can also support/attack other Claims.
6. Premises can support/attack Claims or other Premises.
7. Do NOT include any explanation or commentary - output ONLY the annotation lines.

## Essay to Annotate:

{essay_text}

## Your Annotation (output ONLY the annotation lines, nothing else):
"""


def find_exact_offset(text, span):
    """Find the exact character offset of a span in the text."""
    idx = text.find(span)
    if idx != -1:
        return idx, idx + len(span)
    return None, None


def validate_and_fix_annotation(text, annotation_lines):
    """Validate and fix character offsets in annotations."""
    fixed_lines = []
    entity_texts = {}
    
    for line in annotation_lines:
        line = line.strip()
        if not line:
            continue
            
        if line.startswith('T'):
            # Parse entity annotation
            match = re.match(r'(T\d+)\t(\w+) (\d+) (\d+)\t(.+)', line)
            if match:
                entity_id, entity_type, start, end, span_text = match.groups()
                start, end = int(start), int(end)
                
                # Verify the offset matches the text
                actual_text = text[start:end] if start < len(text) and end <= len(text) else ""
                
                if actual_text != span_text:
                    # Try to find the correct offset
                    new_start, new_end = find_exact_offset(text, span_text)
                    if new_start is not None:
                        start, end = new_start, new_end
                    else:
                        # Try partial match
                        clean_span = span_text.strip()
                        new_start, new_end = find_exact_offset(text, clean_span)
                        if new_start is not None:
                            start, end = new_start, new_end
                            span_text = clean_span
                
                entity_texts[entity_id] = span_text
                fixed_lines.append(f"{entity_id}\t{entity_type} {start} {end}\t{span_text}")
            else:
                fixed_lines.append(line)
        else:
            fixed_lines.append(line)
    
    return fixed_lines


def compute_statistics(annotation_lines):
    """Compute statistics from annotation lines."""
    stats = {
        "MajorClaim": 0,
        "Claim": 0,
        "Premise": 0,
        "Stance_For": 0,
        "Stance_Against": 0,
        "supports": 0,
        "attacks": 0,
    }
    
    for line in annotation_lines:
        line = line.strip()
        if not line:
            continue
        
        if line.startswith('T'):
            # Entity annotation
            match = re.match(r'T\d+\t(\w+) \d+ \d+\t.+', line)
            if match:
                entity_type = match.group(1)
                if entity_type in stats:
                    stats[entity_type] += 1
        
        elif line.startswith('A'):
            # Attribute annotation (Stance)
            if 'Stance' in line:
                if 'For' in line:
                    stats["Stance_For"] += 1
                elif 'Against' in line:
                    stats["Stance_Against"] += 1
        
        elif line.startswith('R'):
            # Relation annotation
            if 'supports' in line:
                stats["supports"] += 1
            elif 'attacks' in line:
                stats["attacks"] += 1
    
    return stats


# ============== Gemini API ==============
def call_gemini(essay_text):
    """Call Google Gemini API."""
    import google.generativeai as genai
    
    genai.configure(api_key=CONFIG["gemini_api_key"])
    model = genai.GenerativeModel(CONFIG["gemini_model"])
    
    prompt = ANNOTATION_PROMPT.format(essay_text=essay_text)
    response = model.generate_content(prompt)
    
    return response.text


# ============== Claude (AWS Bedrock) ==============
def call_claude(essay_text):
    """Call Claude via AWS Bedrock."""
    import boto3
    
    client = boto3.client(
        "bedrock-runtime",
        aws_access_key_id=CONFIG["aws_access_key_id"],
        aws_secret_access_key=CONFIG["aws_secret_access_key"],
        region_name=CONFIG["aws_region"]
    )
    
    prompt = ANNOTATION_PROMPT.format(essay_text=essay_text)
    
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 4096,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    })
    
    response = client.invoke_model(
        modelId=CONFIG["claude_model"],
        body=body
    )
    
    response_body = json.loads(response["body"].read())
    return response_body["content"][0]["text"]


# ============== Azure OpenAI ==============
def call_azure(essay_text):
    """Call Azure OpenAI API."""
    from openai import AzureOpenAI
    
    client = AzureOpenAI(
        api_key=CONFIG["azure_api_key"],
        api_version=CONFIG["azure_api_version"],
        azure_endpoint=CONFIG["azure_endpoint"]
    )
    
    prompt = ANNOTATION_PROMPT.format(essay_text=essay_text)
    
    response = client.chat.completions.create(
        model=CONFIG["azure_deployment"],
        messages=[
            {"role": "user", "content": prompt}
        ],
        max_completion_tokens=4096
    )
    
    return response.choices[0].message.content


def parse_llm_response(response_text):
    """Parse LLM response to extract annotation lines."""
    lines = []
    for line in response_text.strip().split('\n'):
        line = line.strip()
        # Skip empty lines and markdown code blocks
        if not line or line.startswith('```'):
            continue
        # Only keep valid annotation lines
        if line.startswith(('T', 'A', 'R')):
            lines.append(line)
    return lines


def process_essay(essay_path, model_name, call_func, output_dir):
    """Process a single essay with a specific model."""
    essay_name = Path(essay_path).stem
    output_path = output_dir / f"{essay_name}.ann"
    
    # Read essay text
    with open(essay_path, 'r', encoding='utf-8') as f:
        essay_text = f.read()
    
    try:
        # Call LLM
        response = call_func(essay_text)
        
        # Parse response
        annotation_lines = parse_llm_response(response)
        
        # Validate and fix offsets
        fixed_lines = validate_and_fix_annotation(essay_text, annotation_lines)
        
        # Compute statistics for this file
        stats = compute_statistics(fixed_lines)
        
        # Write output
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(fixed_lines))
            if fixed_lines:
                f.write('\n')
        
        print(f"  ✓ {essay_name} -> {output_path.name}")
        return True, essay_name, stats
        
    except Exception as e:
        print(f"  ✗ {essay_name}: {str(e)}")
        return False, essay_name, None


def aggregate_statistics(all_stats):
    """Aggregate statistics from all essays."""
    total = {
        "MajorClaim": 0,
        "Claim": 0,
        "Premise": 0,
        "Stance_For": 0,
        "Stance_Against": 0,
        "supports": 0,
        "attacks": 0,
    }
    
    for stats in all_stats:
        if stats:
            for key in total:
                total[key] += stats.get(key, 0)
    
    return total


def write_run_summary(output_dir, model_name, prompt_used, total_stats, 
                      success_count, fail_count, per_file_stats):
    """Write a summary file for the run."""
    summary_path = output_dir / "summary.txt"
    
    with open(summary_path, 'w', encoding='utf-8') as f:
        f.write("=" * 60 + "\n")
        f.write(f"Argument Mining Annotation Run Summary\n")
        f.write("=" * 60 + "\n\n")
        
        f.write(f"Model: {model_name}\n")
        f.write(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Essays processed: {success_count + fail_count}\n")
        f.write(f"Successful: {success_count}\n")
        f.write(f"Failed: {fail_count}\n\n")
        
        f.write("-" * 60 + "\n")
        f.write("AGGREGATE STATISTICS\n")
        f.write("-" * 60 + "\n\n")
        
        f.write("Entity Counts:\n")
        f.write(f"  MajorClaim: {total_stats['MajorClaim']}\n")
        f.write(f"  Claim: {total_stats['Claim']}\n")
        f.write(f"  Premise: {total_stats['Premise']}\n\n")
        
        f.write("Stance Attributes:\n")
        f.write(f"  For: {total_stats['Stance_For']}\n")
        f.write(f"  Against: {total_stats['Stance_Against']}\n\n")
        
        f.write("Relation Counts:\n")
        f.write(f"  supports: {total_stats['supports']}\n")
        f.write(f"  attacks: {total_stats['attacks']}\n\n")
        
        f.write("-" * 60 + "\n")
        f.write("PER-FILE STATISTICS\n")
        f.write("-" * 60 + "\n\n")
        
        for essay_name, stats in sorted(per_file_stats.items()):
            if stats:
                f.write(f"{essay_name}:\n")
                f.write(f"  MajorClaim: {stats['MajorClaim']}, Claim: {stats['Claim']}, Premise: {stats['Premise']}\n")
                f.write(f"  Stance (For/Against): {stats['Stance_For']}/{stats['Stance_Against']}\n")
                f.write(f"  Relations (supports/attacks): {stats['supports']}/{stats['attacks']}\n\n")
        
        f.write("=" * 60 + "\n")
        f.write("PROMPT USED\n")
        f.write("=" * 60 + "\n\n")
        f.write(prompt_used)
        f.write("\n")
    
    return summary_path


def main():
    """Main function to process all essays with a specified model."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Argument Mining Annotation Script")
    parser.add_argument("--model", type=str, required=True, choices=["gemini", "claude", "azure"],
                        help="Model to use for annotation (required)")
    parser.add_argument("--dataset", type=str, default="all", choices=["v1", "v2", "all"],
                        help="Dataset version to process: v1, v2, or all (default: all)")
    parser.add_argument("--limit", type=int, default=None, 
                        help="Limit number of essays to process (for testing)")
    parser.add_argument("--workers", type=int, default=5,
                        help="Number of parallel workers (default: 5)")
    args = parser.parse_args()
    
    # Setup directories
    text_dir = Path("data/text")
    log_base_dir = Path("logs")
    log_base_dir.mkdir(exist_ok=True)
    
    # Create timestamp for this run
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Get text files based on dataset selection
    if args.dataset == "v1":
        essay_files = sorted(glob.glob(str(text_dir / "v1_*.txt")))
    elif args.dataset == "v2":
        essay_files = sorted(glob.glob(str(text_dir / "v2_*.txt")))
    else:  # all
        essay_files = sorted(glob.glob(str(text_dir / "*.txt")))
    
    # Apply limit if specified
    if args.limit:
        essay_files = essay_files[:args.limit]
    
    if not essay_files:
        print(f"No essay files found in {text_dir}/ directory for dataset '{args.dataset}'")
        return
    
    print(f"Found {len(essay_files)} essays to process (dataset: {args.dataset})\n")
    
    # Map model name to call function
    model_map = {
        "gemini": call_gemini,
        "claude": call_claude,
        "azure": call_azure,
    }
    
    model_name = args.model
    call_func = model_map[model_name]
    
    # Create output directory with model name, dataset, and timestamp
    output_dir = log_base_dir / f"{model_name}_{args.dataset}_{timestamp}"
    output_dir.mkdir(exist_ok=True)
    
    print(f"{'='*50}")
    print(f"Processing with {model_name.upper()} (dataset: {args.dataset})")
    print(f"Output: {output_dir}")
    print(f"Workers: {args.workers}")
    print(f"{'='*50}")
    
    success_count = 0
    fail_count = 0
    all_stats = []
    per_file_stats = {}
    
    # Process essays in parallel
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        # Submit all tasks
        future_to_essay = {
            executor.submit(process_essay, essay_path, model_name, call_func, output_dir): essay_path
            for essay_path in essay_files
        }
        
        # Process completed tasks as they finish
        completed = 0
        total = len(essay_files)
        for future in as_completed(future_to_essay):
            essay_path = future_to_essay[future]
            completed += 1
            try:
                success, essay_name, stats = future.result()
                if success:
                    success_count += 1
                    all_stats.append(stats)
                    per_file_stats[essay_name] = stats
                else:
                    fail_count += 1
                    per_file_stats[essay_name] = None
            except Exception as e:
                essay_name = Path(essay_path).stem
                print(f"  ✗ {essay_name}: {str(e)}")
                fail_count += 1
                per_file_stats[essay_name] = None
            
            # Print progress
            if completed % 10 == 0 or completed == total:
                print(f"Progress: {completed}/{total} ({success_count} succeeded, {fail_count} failed)")
    
    # Aggregate statistics
    total_stats = aggregate_statistics(all_stats)
    
    # Write summary
    summary_path = write_run_summary(
        output_dir, model_name, ANNOTATION_PROMPT, 
        total_stats, success_count, fail_count, per_file_stats
    )
    
    print(f"\n{model_name.upper()} Summary: {success_count} succeeded, {fail_count} failed")
    print(f"Statistics written to: {summary_path}")
    
    print(f"\n{'='*50}")
    print("Processing complete!")
    print(f"{'='*50}")
    print(f"\nLog directory: {output_dir}/")


if __name__ == "__main__":
    main()

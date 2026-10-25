#!/usr/bin/env python3
"""
CSV Quote Fixer - Converts non-RFC-4180 compliant CSV to standard format.

This script fixes Common Bank statement CSV files that contain improperly quoted fields.
The BudgetApp parser expects RFC 4180-compliant CSV with proper quote escaping.

Usage:
    python3 scripts/fix_csv_quote.py <input_file.csv> <output_file.csv>
    Or use the default file in /app directory:
    python3 scripts/fix_csv_quote.py --default

Examples:
    python3 scripts/fix_csv_quote.py testFile.csv testFile_fixed.csv
    python3 scripts/fix_csv_quote.py --default

"""

import csv
import sys
import os


def fix_csv_line(line: str) -> list:
    """
    Parse a single CSV line using RFC 4180 compliant parser.
    
    Args:
        line: Raw CSV line (may contain quotes)
        
    Returns:
        List of parsed field values
        
    Raises:
        ValueError: If parsing fails unexpectedly
    """
    try:
        reader = csv.reader([line])
        return next(reader)
    except Exception as e:
        raise ValueError(f"Failed to parse CSV line: {e}")


def fix_csv(content: str, output_path: str) -> None:
    """
    Fix all lines in CSV content and write to output file.
    
    Args:
        content: Raw CSV content as string
        output_path: Output file path to write fixed content
        
    Note:
        Uses Python's built-in csv module which handles quotes properly.
        The BudgetApp parser has manual parsing that throws errors on complex quotes.
    """
    lines = [line for line in content.strip().split('\n') if line]
    
    result_lines = []
    
    for i, line in enumerate(lines, start=1):
        try:
            # Use standard CSV reader (RFC 4180 compliant)
            row = fix_csv_line(line)
            result_lines.append(','.join(row))
        except Exception as e:
            print(f'Warning: Row {i} error - keeping original', file=sys.stderr)
            # Keep original if fails
            result_lines.append(line)
    
    # Write fixed content
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(result_lines))
    
    print(f'Fixed {len(lines)} rows successfully!')


def main():
    """Main entry point for command line usage."""
    
    # Default files
    DEFAULT_INPUT = '/app/testFile.csv'  # Adjust to your path if running from root
    DEFAULT_OUTPUT = '/app/testFile_fixed.csv'
    
    # Parse arguments
    if len(sys.argv) == 3:
        input_file = sys.argv[1]
        output_file = sys.argv[2]
        
    elif len(sys.argv) == 2 and '--default' in sys.argv:
        input_file = DEFAULT_INPUT
        output_file = DEFAULT_OUTPUT
        
    else:
        print(__doc__)
        print("\nUsage:")
        print("  python3 fix_csv_quote.py <input_file> <output_file>")
        print(f"  python3 fix_csv_quote.py --default")
        print(f"\nDefault files (if running from /Users/stevechui/BudgetApp/):")
        print(f"  Input:  {DEFAULT_INPUT}")
        print(f"  Output: {DEFAULT_OUTPUT}")
        sys.exit(1)
    
    # Check if input file exists
    if not os.path.exists(input_file):
        print(f'Error: Input file "{input_file}" not found!')
        print(f'Make sure you\'re running from the correct directory.')
        print(f'\nYour file path: {input_file}')
        sys.exit(1)
    
    # Process CSV
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    fix_csv(content, output_file)


if __name__ == '__main__':
    main()
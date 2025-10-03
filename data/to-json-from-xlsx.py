import pandas as pd
import json
import os
from typing import List, Dict, Any, Union

# Define columns that should be converted from pandas float (X.0) back to int
# These are typically ID fields where pandas defaults to float due to NaN values in Excel.
INTEGER_ID_KEYS = ["PersonID", "PartnerID", "FatherID", "MotherID", "Generation"]
# Define columns that should be converted from comma-separated strings to a list of numbers/strings
# These are typically relationship lists.
ARRAY_KEYS = ["SiblingID", "ChildID"]


def clean_and_transform_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Applies type-specific cleanups to a single record after initial NaN filling.
    
    1. Converts float-like IDs (e.g., 2.0) to integers (2).
    2. Converts comma-separated strings (e.g., "3, 4, 5") to lists of integers ([3, 4, 5]).
    """
    new_record = {}
    for key, value in record.items():
        if key in INTEGER_ID_KEYS:
            # Check if the value is a float that looks like an integer (e.g., 2.0, 27.0)
            # This handles the float conversion pandas applies when NaNs are present.
            if isinstance(value, float) and value.is_integer():
                new_record[key] = int(value)
            # Keep empty strings ("") or non-float values as-is
            else:
                new_record[key] = value
        
        elif key in ARRAY_KEYS and isinstance(value, str) and value.strip():
            # If it's a non-empty string, split it into a list and attempt conversion to int
            items = [item.strip() for item in value.split(',') if item.strip()]
            
            # Convert list elements to integers if possible, otherwise keep as strings
            int_or_str_items: List[Union[int, str]] = []
            for item in items:
                try:
                    int_or_str_items.append(int(item))
                except ValueError:
                    int_or_str_items.append(item) 
            
            new_record[key] = int_or_str_items
        
        else:
            # For all other columns (like Name, Gender, PlaceBirth, Photo, etc.), keep the value
            new_record[key] = value
            
    return new_record


def convert_xlsx_to_json(xlsx_path: str, json_path: str, sheet_name: int | str = 0) -> bool:
    """
    Reads data from an Excel file, cleans NaN values, converts specific types, 
    and saves it as a JSON file.

    Args:
        xlsx_path (str): The path to the input Excel file.
        json_path (str): The path where the output JSON file will be saved.
        sheet_name (int | str): The sheet name or sheet number (0-indexed) to read.

    Returns:
        bool: True if conversion was successful, False otherwise.
    """
    if not os.path.exists(xlsx_path):
        print(f"Error: The file '{xlsx_path}' was not found.")
        return False
        
    try:
        # Step 1: Read XLSX
        df = pd.read_excel(xlsx_path, sheet_name=sheet_name)

        # Step 2: Initial Clean and Convert to List of Dicts
        # CRITICAL: Replace all NaN values with an empty string ""
        df_cleaned = df.fillna("")

        # Convert the cleaned DataFrame into a list of dictionaries (records)
        people_data: List[Dict[str, Any]] = df_cleaned.to_dict('records')
        
        # Step 3: Apply structural transformations (ID floats and string lists)
        transformed_data = [clean_and_transform_record(record) for record in people_data]

    except Exception as e:
        print(f"An error occurred while reading the Excel file: {e}")
        return False

    # Step 4: Save as JSON
    try:
        with open(json_path, "w", encoding="utf-8") as f:
            # ensure_ascii=False handles non-ASCII characters (like Cyrillic or accents) correctly,
            # and indent=2 makes the output readable.
            json.dump(transformed_data, f, indent=2, ensure_ascii=False)
        
        print(f"✅ XLSX successfully converted to JSON: {json_path}")
        return True

    except IOError as e:
        print(f"Error writing the JSON file '{json_path}': {e}")
        return False

# ------------------------------
# Example Usage
# ------------------------------
if __name__ == "__main__":
    # Define file names
    INPUT_XLSX = "family_data_filled_gen.xlsx"
    OUTPUT_JSON = "family_data.json"

    # NOTE: You must ensure 'family_data_filled_gen.xlsx' exists in the 
    # same directory when running this script for it to work.
    
    # Run the conversion
    convert_xlsx_to_json(INPUT_XLSX, OUTPUT_JSON)

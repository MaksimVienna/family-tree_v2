import pandas as pd
import json
import os # Import the os module

# ------------------------------
# Files
# ------------------------------
xlsx_file = "family_data.xlsx"

# Construct the output JSON file path to be in the parent directory
# 'os.path.pardir' is the platform-independent way to get '..'
parent_dir_json_filename = os.path.join(os.path.pardir, "family_data.json")

# ------------------------------
# Step 1: Read XLSX and convert to list of dicts, replacing NaN
# ------------------------------
try:
    # Read the data
    df = pd.read_excel(xlsx_file, sheet_name=0)
    
    # 💥 CRITICAL CHANGE: Replace all NaN values with an empty string ""
    # This ensures that empty cells in Excel become "" in the JSON.
    df_cleaned = df.fillna("")
    
    # Convert the cleaned DataFrame to the required list of dictionaries
    people = df_cleaned.to_dict('records')
    
except FileNotFoundError:
    print(f"Error: The file '{xlsx_file}' was not found.")
    exit()
except Exception as e:
    print(f"An error occurred while reading the Excel file: {e}")
    exit()

# ------------------------------
# Step 2: Save as JSON in the parent directory
# ------------------------------
try:
    # Use the variable with the parent directory path
    with open(parent_dir_json_filename, "w", encoding="utf-8") as f:
        # ensure_ascii=False handles non-ASCII characters correctly
        json.dump(people, f, indent=2, ensure_ascii=False)

    print(f"XLSX successfully converted to JSON.")
    print(f"The file was saved in the parent directory as: {parent_dir_json_filename}")

except IOError as e:
    print(f"Error: Could not write the JSON file to the parent directory.")
    print(f"Details: {e}")
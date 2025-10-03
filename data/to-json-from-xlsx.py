import pandas as pd
import json

# ------------------------------
# Files
# ------------------------------
xlsx_file = "family_data_filled_gen.xlsx"
output_json_file = "family_data.json"

# ------------------------------
# Step 1: Read XLSX and convert to list of dicts, replacing NaN
# ------------------------------
try:
    # Read the data
    df = pd.read_excel(xlsx_file, sheet_name=0)
    
    # 💥 CRITICAL CHANGE: Replace all NaN values with an empty string ""
    # This ensures that empty cells in Excel become "" in the JSON, 
    # instead of the float "nan" or the string "NaN".
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
# Step 2: Save as JSON
# ------------------------------
with open(output_json_file, "w", encoding="utf-8") as f:
    # ensure_ascii=False handles non-ASCII characters (like Cyrillic) correctly
    json.dump(people, f, indent=2, ensure_ascii=False)

print(f"XLSX successfully converted to JSON: {output_json_file}")
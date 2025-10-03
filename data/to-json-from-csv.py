import csv
import json

# ------------------------------
# Files
# ------------------------------
csv_file = "family_data_filled_gen.csv"
output_json_file = "family_data.json"

# ------------------------------
# Step 1: Read CSV and convert to list of dicts
# ------------------------------
people = []
with open(csv_file, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        people.append(row)

# ------------------------------
# Step 2: Save as JSON
# ------------------------------
with open(output_json_file, "w", encoding="utf-8") as f:
    json.dump(people, f, indent=2, ensure_ascii=False)

print(f"CSV successfully converted to JSON: {output_json_file}")

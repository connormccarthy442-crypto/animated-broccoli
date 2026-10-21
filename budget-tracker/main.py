import json
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from uuid import uuid4


DATA_FILE = Path(__file__).with_name("budget_data.json")
CENT = Decimal("0.01")


def empty_data():
    return {
        "monthly_budget": "0.00",
        "category_budgets": {},
        "transactions": [],
        "recurring_expenses": [],
    }


def load_data(path=DATA_FILE):
    if not path.exists():
        return empty_data()

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        print("Could not read the saved budget data; starting with empty data.")
        return empty_data()

    defaults = empty_data()
    for key, default in defaults.items():
        data.setdefault(key, default)
    return data


def save_data(data, path=DATA_FILE):
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def format_money(amount):
    return f"${Decimal(str(amount)):,.2f}"


def ask_text(prompt):
    while True:
        value = input(prompt).strip()
        if value:
            return value
        print("Please enter a value.")


def ask_money(prompt, allow_zero=False):
    while True:
        try:
            amount = Decimal(input(prompt).strip())
        except InvalidOperation:
            print("Enter a number, such as 12.50.")
            continue

        if not amount.is_finite() or amount < 0 or (amount == 0 and not allow_zero):
            if allow_zero:
                print("Enter an amount that is zero or greater.")
            else:
                print("Enter an amount greater than zero.")
            continue
        return amount.quantize(CENT)


def month_transactions(data, month):
    return [
        transaction
        for transaction in data["transactions"]
        if transaction["date"].startswith(month)
    ]


def sum_transactions(transactions, kind):
    return sum(
        (Decimal(item["amount"]) for item in transactions if item["type"] == kind),
        Decimal("0.00"),
    )


def category_total(transactions, category):
    category_name = category.casefold()
    return sum(
        (
            Decimal(item["amount"])
            for item in transactions
            if item["type"] == "expense"
            and item.get("category", "").casefold() == category_name
        ),
        Decimal("0.00"),
    )


def apply_recurring_expenses(data, today=None, path=DATA_FILE):
    today = today or date.today()
    month = today.strftime("%Y-%m")
    already_added = {
        item.get("recurring_id")
        for item in month_transactions(data, month)
        if item.get("recurring_id")
    }
    added_any = False

    for recurring in data["recurring_expenses"]:
        if recurring["id"] in already_added:
            continue

        data["transactions"].append(
            {
                "date": today.isoformat(),
                "type": "expense",
                "description": recurring["description"],
                "category": recurring["category"],
                "amount": recurring["amount"],
                "recurring_id": recurring["id"],
            }
        )
        print(f"Added recurring expense: {recurring['description']}")
        added_any = True

    if added_any:
        save_data(data, path)


def show_summary(data, today=None):
    today = today or date.today()
    month = today.strftime("%Y-%m")
    transactions = month_transactions(data, month)
    expenses = sum_transactions(transactions, "expense")
    savings = sum_transactions(transactions, "savings")
    investments = sum_transactions(transactions, "investment")
    monthly_budget = Decimal(data["monthly_budget"])
    remaining = monthly_budget - expenses - savings - investments

    print(f"\nBudget Tracker - {today.strftime('%B %Y')}")
    print(f"Monthly budget:       {format_money(monthly_budget)}")
    print(f"Expenses:             {format_money(expenses)}")
    print(f"Savings contributions:{format_money(savings):>12}")
    print(f"Investment contributions:{format_money(investments):>9}")
    print(f"Budget remaining:     {format_money(remaining)}")

    if data["category_budgets"]:
        print("\nCategory budgets:")
        for category, limit_text in sorted(data["category_budgets"].items()):
            limit = Decimal(limit_text)
            spent = category_total(transactions, category)
            if limit == 0:
                print(f"  {category}: {format_money(spent)} spent; no limit set")
                continue

            percent = spent / limit * 100
            print(
                f"  {category}: {format_money(spent)} / {format_money(limit)} "
                f"({percent:.0f}%)"
            )
            if spent >= limit * Decimal("0.75"):
                print(f"  WARNING: {category} has reached at least 75% of its budget.")

    if remaining < 0:
        print("WARNING: You have gone over your total monthly budget.")
    print()


def add_expense(data, path=DATA_FILE):
    description = ask_text("Expense description: ")
    category = ask_text("Category: ")
    amount = ask_money("Amount: $")
    data["transactions"].append(
        {
            "date": date.today().isoformat(),
            "type": "expense",
            "description": description,
            "category": category,
            "amount": str(amount),
        }
    )
    save_data(data, path)

    matching_category = next(
        (
            name
            for name in data["category_budgets"]
            if name.casefold() == category.casefold()
        ),
        None,
    )
    if matching_category:
        limit = Decimal(data["category_budgets"][matching_category])
        spent = category_total(month_transactions(data, date.today().strftime("%Y-%m")), category)
        if limit > 0 and spent >= limit * Decimal("0.75"):
            print(f"WARNING: {category} has reached at least 75% of its budget.")


def add_contribution(data, kind, path=DATA_FILE):
    description = ask_text("Description: ")
    amount = ask_money("Amount: $")
    data["transactions"].append(
        {
            "date": date.today().isoformat(),
            "type": kind,
            "description": description,
            "amount": str(amount),
        }
    )
    save_data(data, path)
    print(f"Recorded {kind} contribution of {format_money(amount)}.")


def set_monthly_budget(data, path=DATA_FILE):
    data["monthly_budget"] = str(
        ask_money("Monthly budget: $", allow_zero=True)
    )
    save_data(data, path)
    print("Monthly budget saved.")


def set_category_budget(data, path=DATA_FILE):
    category = ask_text("Category name: ")
    existing = next(
        (
            name
            for name in data["category_budgets"]
            if name.casefold() == category.casefold()
        ),
        category,
    )
    limit = ask_money("Allocated monthly amount: $", allow_zero=True)
    data["category_budgets"][existing] = str(limit)
    save_data(data, path)
    print(f"Budget for {existing} saved.")


def add_recurring_expense(data, today=None, path=DATA_FILE):
    description = ask_text("Recurring expense description: ")
    category = ask_text("Category: ")
    amount = ask_money("Amount: $")
    data["recurring_expenses"].append(
        {
            "id": str(uuid4()),
            "description": description,
            "category": category,
            "amount": str(amount),
        }
    )
    save_data(data, path)
    apply_recurring_expenses(data, today=today, path=path)


def main():
    data = load_data()
    apply_recurring_expenses(data)

    while True:
        print("1. Show monthly summary")
        print("2. Add an expense")
        print("3. Add money to savings")
        print("4. Add money to investments")
        print("5. Set monthly budget")
        print("6. Set a category budget")
        print("7. Add a recurring expense")
        print("8. Exit")
        choice = input("Choose an option: ").strip()

        if choice == "1":
            show_summary(data)
        elif choice == "2":
            add_expense(data)
        elif choice == "3":
            add_contribution(data, "savings")
        elif choice == "4":
            add_contribution(data, "investment")
        elif choice == "5":
            set_monthly_budget(data)
        elif choice == "6":
            set_category_budget(data)
        elif choice == "7":
            add_recurring_expense(data)
        elif choice == "8":
            print("Budget data saved. Goodbye!")
            break
        else:
            print("Choose a number from 1 to 8.")


if __name__ == "__main__":
    main()

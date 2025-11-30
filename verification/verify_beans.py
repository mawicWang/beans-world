from playwright.sync_api import sync_playwright
import time

def verify_beans():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Ensure the viewport is large enough to see beans moving
        page.set_viewport_size({"width": 800, "height": 600})

        # Navigate to the local server
        page.goto("http://localhost:5173/beans-world/")

        # Wait for beans to initialize and move
        print("Waiting for beans to move...")
        time.sleep(5)

        # Take a screenshot
        screenshot_path = "verification/beans_movement.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    verify_beans()

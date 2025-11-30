
from playwright.sync_api import sync_playwright, expect
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to local dev server
        # Assuming default vite port is 5173, but I should check the log if possible or try common ports
        # The log output was empty, which is suspicious. Maybe it takes time.
        # I'll try 5173.
        try:
            page.goto("http://localhost:5173/beans-world/", timeout=10000)
        except:
            # Fallback if base path is issue or port
            try:
                page.goto("http://localhost:5173/", timeout=10000)
            except:
                 print("Could not connect to localhost:5173")
                 return

        # Wait for canvas to be present
        page.wait_for_selector("canvas", timeout=10000)

        # Wait a bit for beans to move around
        time.sleep(2)

        # Take screenshot
        page.screenshot(path="verification/beans_separation.png")
        print("Screenshot taken at verification/beans_separation.png")

        browser.close()

if __name__ == "__main__":
    run()

from playwright.sync_api import sync_playwright

def verify_bean_visuals():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Using larger viewport to see beans
        page = browser.new_page(viewport={"width": 800, "height": 600})

        # Navigate to the game
        page.goto("http://localhost:5173/beans-world/")

        # Wait for game to load (canvas element)
        page.wait_for_selector("canvas")

        # Wait a bit for beans to spawn and move
        page.wait_for_timeout(3000)

        # Take screenshot
        page.screenshot(path="verification/beans_visuals.png")
        browser.close()

if __name__ == "__main__":
    verify_bean_visuals()

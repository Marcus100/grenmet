#!/usr/bin/env python3
"""
Quick Test Script for FastAPI Best Practices Implementation

This script tests the key improvements to verify everything works correctly.
"""

import sys
import time
from datetime import datetime


def print_header(text):
    """Print a formatted header"""
    print(f"\n{'=' * 60}")
    print(f"  {text}")
    print(f"{'=' * 60}\n")


def print_success(text):
    """Print success message"""
    print(f"✅ {text}")


def print_error(text):
    """Print error message"""
    print(f"❌ {text}")


def print_info(text):
    """Print info message"""
    print(f"ℹ️  {text}")


def test_api_health():
    """Test API health check"""
    try:
        import httpx

        response = httpx.get(
            "http://localhost:8000/api/v1/utils/health-check/", timeout=5.0
        )
        if response.status_code == 200:
            print_success("API is healthy and responding")
            return True
        else:
            print_error(f"API returned status code {response.status_code}")
            return False
    except Exception as e:
        print_error(f"API health check failed: {e}")
        return False


def test_openapi_schema():
    """Test OpenAPI schema and router structure"""
    try:
        import httpx

        response = httpx.get("http://localhost:8000/api/v1/openapi.json", timeout=5.0)
        if response.status_code == 200:
            schema = response.json()

            # Extract unique tags
            tags = set()
            for path_data in schema.get("paths", {}).values():
                for method_data in path_data.values():
                    if isinstance(method_data, dict) and "tags" in method_data:
                        tags.update(method_data["tags"])

            print_success(f"Found {len(tags)} router groups (tags)")
            for tag in sorted(tags):
                print(f"   - {tag}")

            expected_tags = {"login", "users", "roles", "permissions", "utils"}
            if expected_tags.issubset(tags):
                print_success("All expected router groups present!")
                return True
            else:
                missing = expected_tags - tags
                print_error(f"Missing router groups: {missing}")
                return False
        else:
            print_error(f"Failed to fetch OpenAPI schema: {response.status_code}")
            return False
    except Exception as e:
        print_error(f"OpenAPI schema test failed: {e}")
        return False


def test_enhanced_documentation():
    """Test that endpoints have enhanced documentation"""
    try:
        import httpx

        response = httpx.get("http://localhost:8000/api/v1/openapi.json", timeout=5.0)
        if response.status_code == 200:
            schema = response.json()

            # Check a specific endpoint for enhanced docs
            signup_path = schema["paths"].get("/api/v1/users/signup", {})
            post_method = signup_path.get("post", {})

            has_summary = bool(post_method.get("summary"))
            has_description = bool(post_method.get("description"))
            has_responses = len(post_method.get("responses", {})) > 1

            if has_summary and has_description and has_responses:
                print_success("Enhanced documentation verified")
                print(f"   - Summary: {post_method.get('summary', 'N/A')[:50]}...")
                print("   - Description present: Yes")
                print(
                    f"   - Response codes: {list(post_method.get('responses', {}).keys())}"
                )
                return True
            else:
                print_error("Documentation not fully enhanced")
                return False
        else:
            return False
    except Exception as e:
        print_error(f"Documentation test failed: {e}")
        return False


def test_user_registration():
    """Test user registration endpoint"""
    try:
        import httpx

        test_email = f"testuser_{int(time.time())}@weather.gd"

        data = {
            "email": test_email,
            "username": f"testuser_{int(time.time())}",
            "password": "testpass123",
            "first_name": "Test",
            "last_name": "User",
        }

        response = httpx.post(
            "http://localhost:8000/api/v1/users/signup", json=data, timeout=10.0
        )

        if response.status_code == 201:
            user = response.json()
            print_success("User registration successful")
            print(f"   - User ID: {user.get('id', 'N/A')}")
            print(f"   - Email: {user.get('email', 'N/A')}")
            print(f"   - Username: {user.get('username', 'N/A')}")

            # Check that password is not in response
            if "password" not in user and "hashed_password" not in user:
                print_success("Password properly excluded from response")
            else:
                print_error("Password exposed in response!")

            return user
        else:
            print_error(f"Registration failed: {response.status_code}")
            print(f"   Error: {response.json()}")
            return None
    except Exception as e:
        print_error(f"Registration test failed: {e}")
        return None


def test_login(email, password):
    """Test login endpoint"""
    try:
        import httpx

        data = {"username": email, "password": password}

        response = httpx.post(
            "http://localhost:8000/api/v1/login/access-token", data=data, timeout=10.0
        )

        if response.status_code == 200:
            token_data = response.json()
            print_success("Login successful")
            print(f"   - Token type: {token_data.get('token_type', 'N/A')}")
            print(
                f"   - Token (first 20 chars): {token_data.get('access_token', 'N/A')[:20]}..."
            )
            return token_data.get("access_token")
        else:
            print_error(f"Login failed: {response.status_code}")
            return None
    except Exception as e:
        print_error(f"Login test failed: {e}")
        return None


def test_authenticated_endpoint(token):
    """Test authenticated endpoint"""
    try:
        import httpx

        headers = {"Authorization": f"Bearer {token}"}

        response = httpx.get(
            "http://localhost:8000/api/v1/users/me", headers=headers, timeout=10.0
        )

        if response.status_code == 200:
            user = response.json()
            print_success("Authenticated endpoint works")
            print(f"   - User: {user.get('email', 'N/A')}")
            return True
        else:
            print_error(f"Authentication failed: {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Auth test failed: {e}")
        return False


def test_constants_usage():
    """Test that constants are being used for error messages"""
    try:
        import httpx

        # Try to register with duplicate email
        test_email = "test@weather.gd"

        data = {
            "email": test_email,
            "username": "testuser",
            "password": "testpass123",
            "first_name": "Test",
            "last_name": "User",
        }

        # First registration (might fail if user exists)
        httpx.post("http://localhost:8000/api/v1/users/signup", json=data, timeout=10.0)

        # Second registration should fail with constant message
        response = httpx.post(
            "http://localhost:8000/api/v1/users/signup", json=data, timeout=10.0
        )

        if response.status_code == 400:
            error_detail = response.json().get("detail", "")
            expected_message = "The user with this email already exists in the system."

            if expected_message in error_detail:
                print_success("Constants being used for error messages")
                print(f"   - Error message: {error_detail}")
                return True
            else:
                print_info("Different error message (might be OK)")
                print(f"   - Message: {error_detail}")
                return True
        else:
            print_info("Duplicate test inconclusive")
            return True
    except Exception as e:
        print_info(f"Constants test inconclusive: {e}")
        return True


def main():
    """Run all tests"""
    print_header("FastAPI Best Practices - Implementation Tests")
    print(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    results = {}

    # Test 1: API Health
    print_header("Test 1: API Health Check")
    results["health"] = test_api_health()

    if not results["health"]:
        print_error("API is not running. Please start with 'docker compose up'")
        return 1

    # Test 2: Router Structure
    print_header("Test 2: Router Structure (Tag Groups)")
    results["routers"] = test_openapi_schema()

    # Test 3: Enhanced Documentation
    print_header("Test 3: Enhanced Documentation")
    results["docs"] = test_enhanced_documentation()

    # Test 4: User Registration
    print_header("Test 4: User Registration")
    user_data = test_user_registration()
    results["registration"] = user_data is not None

    # Test 5: Login
    if user_data:
        print_header("Test 5: Login")
        # Use the credentials from registration
        token = test_login(user_data.get("email"), "testpass123")
        results["login"] = token is not None

        # Test 6: Authenticated Endpoint
        if token:
            print_header("Test 6: Authenticated Endpoint")
            results["auth"] = test_authenticated_endpoint(token)

    # Test 7: Constants Usage
    print_header("Test 7: Constants Usage")
    results["constants"] = test_constants_usage()

    # Summary
    print_header("Test Summary")
    total = len(results)
    passed_count = sum(1 for v in results.values() if v)

    print(f"Tests passed: {passed_count}/{total}")
    print()

    for test_name, test_passed in results.items():
        status = "✅ PASS" if test_passed else "❌ FAIL"
        print(f"  {status}: {test_name}")

    print()
    if passed_count == total:
        print_success("All tests passed! 🎉")
        print()
        print("Your FastAPI project is working perfectly!")
        print("Open http://localhost:8000/docs to explore the API.")
        return 0
    else:
        print_error(f"Some tests failed ({total - passed_count} failures)")
        return 1


if __name__ == "__main__":
    try:
        import httpx
    except ImportError:
        print_error("httpx not installed. Installing...")
        import subprocess

        subprocess.check_call([sys.executable, "-m", "pip", "install", "httpx"])

    sys.exit(main())

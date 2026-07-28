from flask import Flask, render_template_string, request, redirect, url_for

app = Flask(__name__)

# Dummy credentials
VALID_USERNAME = "admin"
VALID_PASSWORD = "1234"

# Home Route
@app.route('/')
def home():
    return render_template_string("""
    <h1>Welcome to Flask Application</h1>
    <a href="/login">Go to Login</a>
    """)

# Login Route
@app.route('/login', methods=['GET', 'POST'])
def login():
    error = ""

    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        # Validate credentials
        if username == VALID_USERNAME and password == VALID_PASSWORD:
            return redirect(url_for('dashboard'))
        else:
            error = "Invalid Username or Password"

    return render_template_string("""
    <h2>Login Page</h2>

    <form method="POST">
        Username:
        <input type="text" name="username" required><br><br>

        Password:
        <input type="password" name="password" required><br><br>

        <input type="submit" value="Login">
    </form>

    <p style="color:red;">{{ error }}</p>
    """, error=error)

# Dashboard Route
@app.route('/dashboard')
def dashboard():
    return render_template_string("""
    <h1>Dashboard</h1>
    <p>Login Successful!</p>
    <a href="/">Home</a>
    """)

# Run the application
if __name__ == '__main__':
    app.run(debug=True)
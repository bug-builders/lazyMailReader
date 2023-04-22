# Setup

> These answers was generated by GPT4 don't hesitate to ask it more details

## How to generate google client id and secret

To generate a Google Client ID and Google Client Secret for OAuth, follow these steps:

1. Go to the Google Developer Console: https://console.developers.google.com/

2. Sign in with your Google account. If you don't have one, create a new account.

3. Click on the "Select a project" dropdown at the top right corner, then click on the "New Project" button.

4. Enter a name for your project, and select a billing account if you have one. Click "Create" to create the project.

5. Once the project is created, click on the "Dashboard" tab on the left sidebar.

6. Click on the "+ ENABLE APIS AND SERVICES" button at the top of the dashboard.

7. In the API Library, search for "Gmail API" and click on it. Then, click the "Enable" button to enable the Gmail API for your project.

8. Go back to the Dashboard, click on the "OAuth consent screen" tab on the left sidebar.

9. Select "External" for User Type (or "Internal" if you are using a G Suite account and want to limit the app to your organization's users). Click "Create".

10. Fill in the required fields on the OAuth consent screen, such as the Application name, user support email, and authorized domains. Click "Save and Continue".

11. On the "Scopes" step, add any required scopes for your application. Click "Save and Continue".

12. On the "Test users" step, add any test users if needed. Click "Save and Continue".

13. Review your settings and click "Back to Dashboard".

14. Click on the "Credentials" tab on the left sidebar.

15. Click on the "+ CREATE CREDENTIALS" button at the top, then select "OAuth client ID".

16. Choose the Application type Web application and enter a name for your OAuth client.

17. Enter the "Authorized redirect URIs" "http://localhost:3000/oauth2callback".

18. Click the "Create" button.

19. You will now see a pop-up with your Google Client ID and Google Client Secret. Copy these values and store them securely, as you'll need them for your application's OAuth implementation.

20. Click "OK" to close the pop-up.

You now have a Google Client ID and Google Client Secret for your application. Use these values in your OAuth implementation to authenticate users with their Google accounts.

Put this in a `.env` file at the root of this project.

## How to generate openai api key

You cannot directly generate an OpenAI API key. To get an API key for OpenAI, you need to sign up for their API service. Here are the steps to get an API key:

1. Go to the OpenAI website: https://www.openai.com/

2. Click on "Get API Key" or "Sign up," usually located at the top right corner of the website.

3. Create an account by providing your email address, password, and other required information.

4. After successfully signing up, you will have access to the OpenAI platform and its services.

5. To access the API keys, go to the API Keys section of your account dashboard.

6. There, you can generate a new API key or manage your existing keys.

Please note that access to the API might require a subscription, and the availability of the API keys depends on your subscription level. The API keys are confidential, so make sure not to share them publicly.

# Run
```bash
yarn install
yarn build
docker-compose up -d
yarn start
```

## Using GPU

docker-compose up -f docker-compose-gpu.yml  -d

## Disable low disk watermark if you have less than 80% disk free

curl -H 'Content-type: application/json' -XPUT 127.0.0.1:9200/_cluster/settings -d '{
    "transient" : {
        "cluster.routing.allocation.disk.threshold_enabled" : false
    }
}'
# Background
This project uses AWS Simple Notification Service to push SMS to mobile devices.

To use this service, you will need an AWS account.
The first 100 messages sent in the month are free, and additional SMS pushes
are charged per message for all networks. (See [SMS
pricing](https://aws.amazon.com/sns/sms-pricing/) on the AWS documentation).

For a working backup system, expect to receive around 4-5 texts per month
containing the weekly summary of backups. If you believe you will receive more
than 100 messages, consider paying for a higher tier service from AWS.

# Configuring SMS notifications

## IMPORTANT NOTE:
If you are planning on sending messages to only 1 phone number, skip steps 2
and 3. You will provide a single phone number in the configuration file in
step 4.

## Step 1: Initializing Credentials
The suggested mechanism for generating these credentials is to create a new
programmatic access IAM user that you use to generate an `Access key ID` and
`Secret access key`. Alternative you can generate these credentials using a 
different IAM user that already has SNS permission, or you can create a new web
console IAM user and then generate an 'Access Key' for that user.

- Login to AWS web console as a user with permission to create new IAM accounts
- Navigate to the IAM section
- Click 'Add user', define a User name, and select 'Programmatic access' as the
  'Access type'
- On the permissions screen, select 'Attach existing policies directly'
- Search for and select `AmazonSNSRole` to apply to the account
- Review and create the user
- Do not forget to enter the `Secret access key` on the final screen into your
  `alcove.ini` config file as there is no other way to retrieve that key once
  the screen has been closed.

## Step 2: Create a SNS topic
This can be done from the [SNS dashboard](https://console.aws.amazon.com/sns/v2).
Create a topic with an appropriate topic name and display name. This will
generate Amazon Resource Name (ARN) which you can view under Topics.

## Step 3: Create subscriptions (optional)
For each phone number you would like to receive messages, you need to create a
subscription to the topic you have created. You can do so by going to the
Subscriptions page and creating subscriptions to the topic by using the topic
ARN. The protocol should be 'SMS'.

If you only want to send to a single phone number, skip this step and simply 
enter the number in the `sms_to` field of the config using the E.164 format.

## Step 4: Configure the config files
- In `alcove.ini`, the `notifications.sms` section should contain an `sms_to` field
  with the topic ARN OR a single phone number if you only want to send messages
  to one number
 
  **The phone number or ARN need to be surrounded by "" (double quotes)**

- The config file also should include the `aws_region`, `access_key`, and 
  `secret_key`
 
  **SMS notifications will not be enabled unless all 4 values are specified**

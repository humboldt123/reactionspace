#!/bin/bash

# ReactionSpace Quick Deploy Script
# Simple wrapper to deploy from your local machine
# Most of the time you should just SSH in and use server-deploy.sh

cat << 'EOF'
╔═══════════════════════════════════════════════════════════╗
║          ReactionSpace Deployment Helper                  ║
╚═══════════════════════════════════════════════════════════╝

This script is just a quick helper. For most deployments, you should:

1. Push your changes to git:
   $ git push origin main

2. SSH into your server:
   $ ssh vish@YOUR_SERVER

3. Run the server deployment script:
   $ cd /home/vish/reactionspace
   $ ./server-deploy.sh deploy

That's it! The server script handles everything automatically.

═══════════════════════════════════════════════════════════

Need help? Check DEPLOYMENT.md for full instructions.

EOF

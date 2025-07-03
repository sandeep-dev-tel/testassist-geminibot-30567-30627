#!/bin/bash
cd /home/kavia/workspace/code-generation/testassist-geminibot-30567-30627/frontend_reactjs
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi


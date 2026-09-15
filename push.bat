@echo off
set GIT="C:\Users\ASUS\AppData\Local\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd\git.exe"

echo Attempting git push...
%GIT% push -u origin main

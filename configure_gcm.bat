@echo off
set GIT="C:\Users\ASUS\AppData\Local\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd\git.exe"

%GIT% config set --global credential.helper "C:/Users/ASUS/AppData/Local/Programs/Git Credential Manager/git-credential-manager.exe"
%GIT% config set --global credential.credentialStore wincredman
%GIT% config get --global credential.helper
%GIT% config get --global credential.credentialStore

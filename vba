Option Explicit

' Salesforce authentication and limits constants
Private Const MAX_FIELDS_PER_BATCH As Integer = 100 ' Adjust based on testing
Private Const SF_AUTH_URL As String = "https://login.salesforce.com/services/oauth2/token" ' Or use test.salesforce.com
Private Const SF_CLIENT_ID As String = "YOUR_CONNECTED_APP_CLIENT_ID"
Private Const SF_CLIENT_SECRET As String = "YOUR_CONNECTED_APP_CLIENT_SECRET"
Private Const SF_REFRESH_TOKEN As String = "YOUR_REFRESH_TOKEN"
Private Const SF_ANONYMOUS_APEX_ENDPOINT As String = "/services/data/v58.0/tooling/executeAnonymous"

' Main procedure to process permissions check - This is what you'll assign to your button
Sub CheckFieldPermissions()
    Dim accessToken As String
    Dim instanceUrl As String
    Dim lastRow As Long
    Dim batchSize As Integer
    Dim currentBatch As Integer
    Dim totalBatches As Long
    Dim i As Long
    Dim startTime As Double
    Dim dataWs As Worksheet
    Dim logWs As Worksheet
    
    ' Error handling
    On Error GoTo ErrorHandler
    
    ' Set references to worksheets
    Set dataWs = ActiveSheet
    
    ' Create log sheet if it doesn't exist
    On Error Resume Next
    Set logWs = ThisWorkbook.Worksheets("Log")
    On Error GoTo 0
    
    If logWs Is Nothing Then
        Set logWs = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        logWs.Name = "Log"
        logWs.Cells(1, 1).Value = "Timestamp"
        logWs.Cells(1, 2).Value = "Message"
    End If
    
    ' Log start of process
    LogMessage logWs, "Starting permission verification process"
    
    ' Authenticate with Salesforce
    If Not AuthenticateWithRefreshToken(accessToken, instanceUrl, logWs) Then
        MsgBox "Failed to authenticate with Salesforce. Check the Log sheet for details.", vbCritical
        Exit Sub
    End If
    
    ' Find the last row with data
    lastRow = dataWs.Cells(dataWs.Rows.Count, 1).End(xlUp).Row
    
    ' Check if we have data
    If lastRow <= 1 Then
        MsgBox "No data found in Column A. Please add data in the format ObjectName.FieldName.Edit/Read", vbExclamation
        Exit Sub
    End If
    
    ' Ensure we have headers
    If dataWs.Cells(1, 1).Value = "" Then
        dataWs.Cells(1, 1).Value = "Object.Field.Permission"
    End If
    
    If dataWs.Cells(1, 2).Value = "" Then
        dataWs.Cells(1, 2).Value = "Has Permission"
    End If
    
    ' Calculate how many batches we'll need
    batchSize = MAX_FIELDS_PER_BATCH
    totalBatches = Application.WorksheetFunction.Ceiling((lastRow - 1) / batchSize, 1)
    
    ' Initialize progress
    startTime = Timer
    Application.StatusBar = "Preparing to process " & lastRow - 1 & " fields in " & totalBatches & " batches..."
    Application.ScreenUpdating = False
    
    ' Process data in batches
    currentBatch = 0
    
    For i = 2 To lastRow Step batchSize
        ' Increment batch counter
        currentBatch = currentBatch + 1
        
        ' Calculate batch end row (handle last batch)
        Dim endRow As Long
        endRow = Application.WorksheetFunction.Min(i + batchSize - 1, lastRow)
        
        ' Process this batch
        Application.StatusBar = "Processing batch " & currentBatch & " of " & totalBatches & "..."
        ProcessBatch dataWs, logWs, accessToken, instanceUrl, i, endRow
        
        ' Update progress
        Application.StatusBar = "Completed batch " & currentBatch & " of " & totalBatches & " (" & _
                                Format((currentBatch / totalBatches) * 100, "0.0") & "%)"
        DoEvents
    Next i
    
    ' Clean up
    Application.StatusBar = False
    Application.ScreenUpdating = True
    
    ' Log completion
    LogMessage logWs, "Completed all permission checks in " & Format(Timer - startTime, "0.00") & " seconds"
    
    ' Show completion message
    MsgBox "Permission verification complete!" & vbNewLine & _
           "Processed " & lastRow - 1 & " fields in " & totalBatches & " batches." & vbNewLine & _
           "Total time: " & Format(Timer - startTime, "0.00") & " seconds", vbInformation
    
    Exit Sub
    
ErrorHandler:
    Application.StatusBar = False
    Application.ScreenUpdating = True
    LogMessage logWs, "ERROR: " & Err.Description
    MsgBox "An error occurred: " & Err.Description, vbCritical
End Sub

' Function to authenticate with Salesforce using refresh token
Function AuthenticateWithRefreshToken(ByRef accessToken As String, ByRef instanceUrl As String, logWs As Worksheet) As Boolean
    Dim http As Object
    Dim responseText As String
    Dim requestBody As String
    
    ' Set initial return values
    accessToken = ""
    instanceUrl = ""
    AuthenticateWithRefreshToken = False
    
    ' Log authentication attempt
    LogMessage logWs, "Attempting to authenticate with Salesforce..."
    
    ' Create HTTP request object
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    
    ' Prepare authentication request
    requestBody = "grant_type=refresh_token" & _
                 "&client_id=" & SF_CLIENT_ID & _
                 "&client_secret=" & SF_CLIENT_SECRET & _
                 "&refresh_token=" & SF_REFRESH_TOKEN
    
    ' Send request
    On Error Resume Next
    http.Open "POST", SF_AUTH_URL, False
    http.setRequestHeader "Content-Type", "application/x-www-form-urlencoded"
    http.send requestBody
    
    ' Check for request errors
    If Err.Number <> 0 Then
        LogMessage logWs, "ERROR: Authentication request failed - " & Err.Description
        Exit Function
    End If
    On Error GoTo 0
    
    ' Get response
    responseText = http.responseText
    
    ' Check if request was successful
    If http.Status = 200 Then
        ' Parse the JSON response
        Dim json As Object
        Set json = ParseJSON(responseText)
        
        ' Extract access token and instance URL
        If Not json Is Nothing Then
            If json.Exists("access_token") And json.Exists("instance_url") Then
                accessToken = json("access_token")
                instanceUrl = json("instance_url")
                AuthenticateWithRefreshToken = True
                LogMessage logWs, "Successfully authenticated with Salesforce"
            Else
                LogMessage logWs, "ERROR: Missing tokens in authentication response"
            End If
        Else
            LogMessage logWs, "ERROR: Failed to parse authentication response"
        End If
    Else
        LogMessage logWs, "ERROR: Authentication failed. Status: " & http.Status & ", Response: " & Left(responseText, 500)
    End If
    
    Set http = Nothing
End Function

' Process a batch of rows
Sub ProcessBatch(dataWs As Worksheet, logWs As Worksheet, accessToken As String, instanceUrl As String, startRow As Long, endRow As Long)
    Dim i As Long
    Dim fieldEntries() As String
    Dim rowIndices() As Long
    Dim apexCode As String
    Dim response As String
    Dim count As Long
    
    ' Initialize arrays to store field entries and row indices
    count = endRow - startRow + 1
    ReDim fieldEntries(1 To count)
    ReDim rowIndices(1 To count)
    
    ' Collect field entries and row indices
    For i = 1 To count
        fieldEntries(i) = dataWs.Cells(startRow + i - 1, 1).Value
        rowIndices(i) = startRow + i - 1
    Next i
    
    ' Generate Apex code for this batch
    apexCode = GenerateApexCode(fieldEntries)
    
    ' Log the operation
    LogMessage logWs, "Processing batch from row " & startRow & " to " & endRow & " with " & count & " fields"
    
    ' Execute anonymous Apex
    response = ExecuteAnonymousApex(instanceUrl, accessToken, apexCode, logWs)
    
    ' Parse the response and update the worksheet
    ParseResponseAndUpdateWorksheet dataWs, logWs, response, fieldEntries, rowIndices
End Sub

' Generate Apex code to check permissions for a batch of fields
Function GenerateApexCode(fieldEntries() As String) As String
    Dim apex As String
    Dim i As Long
    Dim parts As Variant
    Dim objectName As String
    Dim fieldName As String
    Dim permType As String
    Dim entryKey As String
    
    ' Start building Apex code
    apex = "// Apex script to check field permissions" & vbCrLf
    apex = apex & "Map<String, Boolean> permResults = new Map<String, Boolean>();" & vbCrLf & vbCrLf
    
    ' Process each field entry
    For i = LBound(fieldEntries) To UBound(fieldEntries)
        If Len(Trim(fieldEntries(i))) > 0 Then
            ' Parse the field specification (ObjectName.FieldName.Edit/Read)
            parts = Split(fieldEntries(i), ".")
            
            ' Ensure we have all three parts
            If UBound(parts) >= 2 Then
                objectName = parts(0)
                fieldName = parts(1)
                permType = parts(2)
                entryKey = fieldEntries(i)
                
                ' Add code to check this permission
                apex = apex & "try {" & vbCrLf
                
                ' Different check logic for Edit vs Read permissions
                If UCase(permType) = "EDIT" Then
                    apex = apex & "    Schema.DescribeSObjectResult objDesc = Schema.getGlobalDescribe().get('" & objectName & "').getDescribe();" & vbCrLf
                    apex = apex & "    Map<String, Schema.SObjectField> fieldMap = objDesc.fields.getMap();" & vbCrLf
                    apex = apex & "    Schema.DescribeFieldResult fieldDesc = fieldMap.get('" & fieldName & "').getDescribe();" & vbCrLf
                    apex = apex & "    permResults.put('" & entryKey & "', fieldDesc.isUpdateable());" & vbCrLf
                ElseIf UCase(permType) = "READ" Then
                    apex = apex & "    Schema.DescribeSObjectResult objDesc = Schema.getGlobalDescribe().get('" & objectName & "').getDescribe();" & vbCrLf
                    apex = apex & "    Map<String, Schema.SObjectField> fieldMap = objDesc.fields.getMap();" & vbCrLf
                    apex = apex & "    Schema.DescribeFieldResult fieldDesc = fieldMap.get('" & fieldName & "').getDescribe();" & vbCrLf
                    apex = apex & "    permResults.put('" & entryKey & "', fieldDesc.isAccessible());" & vbCrLf
                Else
                    ' For any other permission type, add a placeholder
                    apex = apex & "    permResults.put('" & entryKey & "', false); // Unsupported permission type: " & permType & vbCrLf
                End If
                
                ' Add error handling
                apex = apex & "} catch (Exception e) {" & vbCrLf
                apex = apex & "    System.debug('ERROR for " & entryKey & ": ' + e.getMessage());" & vbCrLf
                apex = apex & "    permResults.put('" & entryKey & "', false);" & vbCrLf
                apex = apex & "}" & vbCrLf & vbCrLf
            End If
        End If
    Next i
    
    ' Add code to output the results
    apex = apex & "// Output the results" & vbCrLf
    apex = apex & "for (String key : permResults.keySet()) {" & vbCrLf
    apex = apex & "    System.debug('PERMISSION_RESULT:' + key + ':' + permResults.get(key));" & vbCrLf
    apex = apex & "}" & vbCrLf
    
    GenerateApexCode = apex
End Function

' Execute anonymous Apex code
Function ExecuteAnonymousApex(instanceUrl As String, accessToken As String, apexCode As String, logWs As Worksheet) As String
    Dim http As Object
    Dim url As String
    Dim encodedApex As String
    
    ' Log the operation
    LogMessage logWs, "Executing anonymous Apex..."
    
    ' Encode the Apex code for URL
    encodedApex = URLEncode(apexCode)
    
    ' Create the URL for anonymous Apex execution
    url = instanceUrl & SF_ANONYMOUS_APEX_ENDPOINT & "?anonymousBody=" & encodedApex
    
    ' Create HTTP request object
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    
    ' Send request
    On Error Resume Next
    http.Open "GET", url, False
    http.setRequestHeader "Authorization", "Bearer " & accessToken
    http.setRequestHeader "Content-Type", "application/json"
    http.send
    
    ' Check for request errors
    If Err.Number <> 0 Then
        LogMessage logWs, "ERROR: Apex execution request failed - " & Err.Description
        ExecuteAnonymousApex = "{""error"":""" & Err.Description & """}"
        Exit Function
    End If
    On Error GoTo 0
    
    ' Return the response
    ExecuteAnonymousApex = http.responseText
    
    ' Log status
    If http.Status = 200 Then
        LogMessage logWs, "Apex executed successfully"
    Else
        LogMessage logWs, "ERROR: Apex execution failed. Status: " & http.Status
    End If
    
    Set http = Nothing
End Function

' Parse the Apex execution response and update the worksheet
Sub ParseResponseAndUpdateWorksheet(dataWs As Worksheet, logWs As Worksheet, response As String, fieldEntries() As String, rowIndices() As Long)
    Dim json As Object
    Dim success As Boolean
    Dim logs As String
    Dim i As Long
    Dim lines As Variant
    Dim line As String
    Dim permissionResults As New Collection
    Dim parts As Variant
    Dim fieldKey As String
    Dim hasPermission As Boolean
    
    ' Parse the JSON response
    Set json = ParseJSON(response)
    
    ' Check if execution was successful
    If Not json Is Nothing And json.Exists("success") Then
        success = json("success")
        
        If success Then
            ' Extract debug logs which contain our permission results
            If json.Exists("logs") Then
                logs = json("logs")
                
                ' Split logs into lines
                lines = Split(logs, vbLf)
                
                ' Extract permission results from logs
                For i = LBound(lines) To UBound(lines)
                    line = Trim(lines(i))
                    
                    ' Look for our permission result markers
                    If InStr(line, "PERMISSION_RESULT:") > 0 Then
                        ' Parse the result line
                        line = Replace(line, "|DEBUG|", "")
                        line = Mid(line, InStr(line, "PERMISSION_RESULT:") + 18)
                        
                        ' Extract field key and permission value
                        parts = Split(line, ":")
                        
                        If UBound(parts) >= 1 Then
                            fieldKey = parts(0)
                            hasPermission = (LCase(parts(1)) = "true")
                            
                            ' Store in collection
                            On Error Resume Next
                            permissionResults.Add hasPermission, fieldKey
                            On Error GoTo 0
                        End If
                    End If
                Next i
                
                ' Update worksheet with permission results
                For i = LBound(fieldEntries) To UBound(fieldEntries)
                    If Len(Trim(fieldEntries(i))) > 0 Then
                        On Error Resume Next
                        If Err.Number = 0 Then
                            dataWs.Cells(rowIndices(i), 2).Value = permissionResults(fieldEntries(i))
                        Else
                            dataWs.Cells(rowIndices(i), 2).Value = "ERROR: Result not found"
                        End If
                        Err.Clear
                        On Error GoTo 0
                    End If
                Next i
                
                LogMessage logWs, "Updated " & permissionResults.Count & " permission results"
            Else
                LogMessage logWs, "ERROR: No logs found in the response"
                ' Mark all entries as error
                For i = LBound(fieldEntries) To UBound(fieldEntries)
                    If Len(Trim(fieldEntries(i))) > 0 Then
                        dataWs.Cells(rowIndices(i), 2).Value = "ERROR: No logs found"
                    End If
                Next i
            End If
        Else
            ' Execution failed
            Dim errorMsg As String
            If json.Exists("compileProblem") Then
                errorMsg = json("compileProblem")
            ElseIf json.Exists("exceptionMessage") Then
                errorMsg = json("exceptionMessage")
            Else
                errorMsg = "Unknown error"
            End If
            
            LogMessage logWs, "ERROR: Apex execution failed - " & errorMsg
            
            ' Mark all entries as error
            For i = LBound(fieldEntries) To UBound(fieldEntries)
                If Len(Trim(fieldEntries(i))) > 0 Then
                    dataWs.Cells(rowIndices(i), 2).Value = "ERROR: Apex failed"
                End If
            Next i
        End If
    Else
        LogMessage logWs, "ERROR: Invalid response from Salesforce"
        
        ' Mark all entries as error
        For i = LBound(fieldEntries) To UBound(fieldEntries)
            If Len(Trim(fieldEntries(i))) > 0 Then
                dataWs.Cells(rowIndices(i), 2).Value = "ERROR: Invalid response"
            End If
        Next i
    End If
End Sub

' Helper function to log messages
Sub LogMessage(logWs As Worksheet, message As String)
    Dim lastRow As Long
    
    ' Find the last row in the log sheet
    lastRow = logWs.Cells(logWs.Rows.Count, 1).End(xlUp).Row + 1
    
    ' Add timestamp and message
    logWs.Cells(lastRow, 1).Value = Now
    logWs.Cells(lastRow, 2).Value = message
End Sub

' URL encode a string
Function URLEncode(text As String) As String
    Dim i As Long
    Dim acode As Long
    Dim char As String
    Dim result As String
    
    ' Process each character
    For i = 1 To Len(text)
        char = Mid(text, i, 1)
        acode = Asc(char)
        
        ' Encode special characters
        Select Case acode
            Case 48 To 57, 65 To 90, 97 To 122  ' 0-9, A-Z, a-z
                result = result & char
            Case 32  ' space
                result = result & "+"
            Case Else
                result = result & "%" & Hex(acode)
        End Select
    Next i
    
    URLEncode = result
End Function

' Parse a JSON string to a Dictionary object
Function ParseJSON(jsonString As String) As Object
    Dim dict As Object
    Dim stack As New Collection
    Dim current As Object
    Dim key As String
    Dim value As String
    Dim inString As Boolean
    Dim escapeNext As Boolean
    Dim i As Long
    Dim char As String
    
    ' Create a new Dictionary to hold the result
    Set dict = CreateObject("Scripting.Dictionary")
    Set current = dict
    
    ' Simplified JSON parsing
    ' Note: This is a very basic parser and may not handle all JSON cases
    i = 1
    While i <= Len(jsonString)
        char = Mid(jsonString, i, 1)
        
        Select Case char
            Case "{"
                ' Start a new object
                If Len(key) > 0 Then
                    Dim newDict As Object
                    Set newDict = CreateObject("Scripting.Dictionary")
                    current.Add key, newDict
                    stack.Add current
                    Set current = newDict
                    key = ""
                End If
            Case "}"
                ' End current object
                If stack.Count > 0 Then
                    Set current = stack(stack.Count)
                    stack.Remove stack.Count
                End If
            Case """"
                ' Start or end a string
                If escapeNext Then
                    ' Escaped quote
                    If Len(key) = 0 Then
                        key = key & char
                    Else
                        value = value & char
                    End If
                    escapeNext = False
                Else
                    If inString Then
                        inString = False
                    Else
                        inString = True
                    End If
                End If
            Case "\"
                ' Escape character
                If escapeNext Then
                    ' Double escape - add a single backslash
                    If Len(key) = 0 Then
                        key = key & char
                    Else
                        value = value & char
                    End If
                    escapeNext = False
                Else
                    escapeNext = True
                End If
            Case ":"
                ' Separator between key and value
                If Not inString Then
                    ' Start collecting value
                    value = ""
                Else
                    ' Colon inside a string
                    If Len(key) = 0 Then
                        key = key & char
                    Else
                        value = value & char
                    End If
                End If
            Case ","
                ' Separator between key-value pairs
                If Not inString Then
                    ' Add current key-value pair to dictionary
                    If Len(key) > 0 And Len(value) > 0 Then
                        ' Basic type conversion
                        If LCase(value) = "true" Then
                            current.Add key, True
                        ElseIf LCase(value) = "false" Then
                            current.Add key, False
                        ElseIf IsNumeric(value) Then
                            current.Add key, CDbl(value)
                        Else
                            current.Add key, value
                        End If
                        key = ""
                        value = ""
                    End If
                Else
                    ' Comma inside a string
                    If Len(key) = 0 Then
                        key = key & char
                    Else
                        value = value & char
                    End If
                End If
            Case Else
                ' Add character to current string
                If inString Then
                    If Len(key) = 0 Then
                        key = key & char
                    Else
                        value = value & char
                    End If
                ElseIf Len(value) > 0 Then
                    ' Add to value
                    value = value & char
                End If
        End Select
        
        i = i + 1
    Wend
    
    ' Add any remaining key-value pair
    If Len(key) > 0 And Len(value) > 0 Then
        ' Basic type conversion
        If LCase(value) = "true" Then
            current.Add key, True
        ElseIf LCase(value) = "false" Then
            current.Add key, False
        ElseIf IsNumeric(value) Then
            current.Add key, CDbl(value)
        Else
            current.Add key, value
        End If
    End If
    
    ' Return the parsed object
    Set ParseJSON = dict
End Function
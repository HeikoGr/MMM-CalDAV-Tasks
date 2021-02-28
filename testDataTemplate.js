/* eslint-disable indent */
var testTasks = [
`
BEGIN:VTODO
UID:cad05b4d-abca-4a32-8df1-e39c7b87f3cf
CREATED:20210225T235315
LAST-MODIFIED:20210225T235315
DTSTAMP:20210225T235315
SUMMARY:Make SmartMirror Extension
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:995c21d9-3829-455d-b7cb-5738e1cb4802
CREATED:20210225T235324
LAST-MODIFIED:20210226T011207
DTSTAMP:20210226T011207
SUMMARY:Go to sleep
PERCENT-COMPLETE:100
COMPLETED:20210226T011207
STATUS:COMPLETED
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:c4b624fb-c1b4-476d-9535-5dcadccb77d1
CREATED:20210226T140955
LAST-MODIFIED:20210226T141027
DTSTAMP:20210226T141027
SUMMARY:Make Module
RELATED-TO:cad05b4d-abca-4a32-8df1-e39c7b87f3cf
PERCENT-COMPLETE:100
COMPLETED:20210226T141027
STATUS:COMPLETED
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:c2088ba3-3469-4339-96fa-3c18b2b76d86
CREATED:20210226T141001
LAST-MODIFIED:20210226T141027
DTSTAMP:20210226T141027
SUMMARY:Connect to CalDev
RELATED-TO:cad05b4d-abca-4a32-8df1-e39c7b87f3cf
PERCENT-COMPLETE:100
COMPLETED:20210226T141027
STATUS:COMPLETED
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:75726670-9299-45b7-b8ed-52804bebf552
CREATED:20210226T141013
LAST-MODIFIED:20210226T141013
DTSTAMP:20210226T141013
SUMMARY:allow nested todos
RELATED-TO:cad05b4d-abca-4a32-8df1-e39c7b87f3cf
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:be162dca-340f-4d3d-a0c9-a63be102f6d5
CREATED:20210226T141024
LAST-MODIFIED:20210226T141024
DTSTAMP:20210226T141024
SUMMARY:add styling
RELATED-TO:cad05b4d-abca-4a32-8df1-e39c7b87f3cf
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:8b76d0d8-8320-48d3-9b62-99d216e4fdbb
CREATED:20210226T141403
LAST-MODIFIED:20210226T141403
DTSTAMP:20210226T141403
SUMMARY:Allow even deeper nesting
RELATED-TO:75726670-9299-45b7-b8ed-52804bebf552
END:VTODO
END:VCALENDAR

BEGIN:VTODO
UID:9bf0daca-3b45-4637-8685-8917b31ca938
CREATED:20210226T195720
LAST-MODIFIED:20210226T195807
DTSTAMP:20210226T195807
SUMMARY:alpha
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:fdec9ae4-4a1e-4f1c-abba-c64d23699bcb
CREATED:20210226T195722
LAST-MODIFIED:20210226T221601
DTSTAMP:20210226T221601
SUMMARY:beta
PERCENT-COMPLETE:100
COMPLETED:20210226T221601
STATUS:COMPLETED
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:6d60ec56-d090-4a48-9798-48636d67173c
CREATED:20210226T202129
LAST-MODIFIED:20210226T202129
DTSTAMP:20210226T202129
SUMMARY:this is alpha subtask
RELATED-TO:9bf0daca-3b45-4637-8685-8917b31ca938
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:472b5a31-cac8-4d6a-9cf1-749cde869550
CREATED:20210226T202137
LAST-MODIFIED:20210226T202423
DTSTAMP:20210226T202423
SUMMARY:01 - should be on top
RELATED-TO:6d60ec56-d090-4a48-9798-48636d67173c
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:f1c572c7-119d-4238-9a5c-13103adb9f6a
CREATED:20210226T202148
LAST-MODIFIED:20210226T220206
DTSTAMP:20210226T220206
SUMMARY:now it's getting complicated
RELATED-TO:fdec9ae4-4a1e-4f1c-abba-c64d23699bcb
PERCENT-COMPLETE:100
COMPLETED:20210226T220206
STATUS:COMPLETED
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:7eb1c522-d2d9-49b1-a773-3cf4f23357cf
CREATED:20210226T202440
LAST-MODIFIED:20210226T202440
DTSTAMP:20210226T202440
SUMMARY:02 - shouldnt
RELATED-TO:6d60ec56-d090-4a48-9798-48636d67173c
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:a180f397-34d9-4fd7-8023-cc5635f3612f
CREATED:20210226T202924
LAST-MODIFIED:20210226T202924
DTSTAMP:20210226T202924
SUMMARY:how
RELATED-TO:8b76d0d8-8320-48d3-9b62-99d216e4fdbb
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:ca8362e0-022f-419b-9efb-56c6596dfe0d
CREATED:20210226T202928
LAST-MODIFIED:20210226T202928
DTSTAMP:20210226T202928
SUMMARY:deep
RELATED-TO:a180f397-34d9-4fd7-8023-cc5635f3612f
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:bd4e391b-a4ce-4e67-914b-ac3bc84b1c50
CREATED:20210226T202931
LAST-MODIFIED:20210226T220521
DTSTAMP:20210226T220521
SUMMARY:can
RELATED-TO:ca8362e0-022f-419b-9efb-56c6596dfe0d
PERCENT-COMPLETE:100
COMPLETED:20210226T220521
STATUS:COMPLETED
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:aef5d04c-c0a8-4e8e-ba97-be61ffef6972
CREATED:20210226T202935
LAST-MODIFIED:20210226T220521
DTSTAMP:20210226T220521
SUMMARY:we
RELATED-TO:bd4e391b-a4ce-4e67-914b-ac3bc84b1c50
PERCENT-COMPLETE:100
COMPLETED:20210226T220521
STATUS:COMPLETED
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:86d24958-df1c-4986-b8e0-88968ceb52d0
CREATED:20210226T202938
LAST-MODIFIED:20210226T220521
DTSTAMP:20210226T220521
SUMMARY:go
RELATED-TO:aef5d04c-c0a8-4e8e-ba97-be61ffef6972
PERCENT-COMPLETE:100
COMPLETED:20210226T220521
STATUS:COMPLETED
END:VTODO
END:VCALENDAR
`,
`
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Tasks v0.13.6
BEGIN:VTODO
UID:3cae788b-ddac-49e9-9ae1-c377eccabdab
CREATED:20210226T230440
LAST-MODIFIED:20210226T230549
DTSTAMP:20210226T230549
SUMMARY:This task has due date
DTSTART:20210227T000000
DUE:20210228T010000
PERCENT-COMPLETE:32
STATUS:IN-PROCESS
PRIORITY:2
DESCRIPTION:
END:VTODO
END:VCALENDAR
`
];

module.exports = testTasks;
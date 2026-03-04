-- Enable Realtime for tables used by the dashboard
-- Run this in Supabase SQL Editor, or enable via Dashboard: Database > Replication

-- Add tables to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE boardcards;
ALTER PUBLICATION supabase_realtime ADD TABLE cardslist;
ALTER PUBLICATION supabase_realtime ADD TABLE itemslist;
ALTER PUBLICATION supabase_realtime ADD TABLE item_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE boards;
ALTER PUBLICATION supabase_realtime ADD TABLE board_members;
ALTER PUBLICATION supabase_realtime ADD TABLE workspace;
ALTER PUBLICATION supabase_realtime ADD TABLE board_list_order;
